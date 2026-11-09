"""Magnus Trainee Tracker - Flask server.

Serves the front end from ./static and stores all trainee data in data.json.
Run:  pip install -r requirements.txt  &&  python app.py
Open: http://localhost:5000
"""
import json
import os
import subprocess
import tempfile
import threading

from botocore.exceptions import BotoCoreError, ClientError
from flask import Flask, Response, jsonify, request

from CLOUD_FLARE.modules import (
    create_parent_folder,
    get_parent_folders,
    get_video_folders,
    get_video_object,
    upload_video_as_hls,
)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, "data.json")
lock = threading.Lock()

app = Flask(__name__, static_folder="static", static_url_path="")


def read_data():
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_data(data):
    # write to a temp file first so a crash never corrupts data.json
    fd, tmp = tempfile.mkstemp(dir=BASE, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, DATA_FILE)


@app.get("/")
def index():
    return app.send_static_file("index.html")


@app.get("/api/trainees")
def get_trainees():
    with lock:
        return jsonify(read_data())


@app.put("/api/trainees")
def put_trainees():
    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify(error="Expected a JSON list of trainees"), 400
    with lock:
        write_data(data)
    return jsonify(ok=True, count=len(data))


@app.get("/api/videos")
def list_video_folders():
    try:
        return jsonify(folders=get_video_folders())
    except RuntimeError as exc:
        app.logger.error("Video storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not list video folders")
        return jsonify(error="Could not load videos from storage."), 502


@app.get("/api/video-folders")
def list_video_parent_folders():
    try:
        return jsonify(folders=get_parent_folders())
    except RuntimeError as exc:
        app.logger.error("Video storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not list video parent folders")
        return jsonify(error="Could not load parent folders from storage."), 502


@app.post("/api/video-folders")
def add_video_parent_folder():
    data = request.get_json(silent=True)
    folder_name = data.get("folder", "") if isinstance(data, dict) else ""
    if not isinstance(folder_name, str):
        return jsonify(error="Enter a valid parent folder name."), 400

    try:
        create_parent_folder(folder_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except FileExistsError as exc:
        return jsonify(error=str(exc)), 409
    except RuntimeError as exc:
        app.logger.error("Video storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not create video parent folder")
        return jsonify(error="Could not create parent folder in storage."), 502

    return jsonify(folder=folder_name), 201


@app.get("/api/videos/<path:object_key>")
def stream_video_object(object_key):
    parts = object_key.split("/")
    if (
        len(parts) < 2
        or any(part in ("", ".", "..") for part in parts)
        or not (
            parts[-1] == "index.m3u8"
            or (parts[-1].startswith("segment_") and parts[-1].endswith(".ts"))
        )
    ):
        return jsonify(error="Invalid video path"), 400

    try:
        video_object = get_video_object(object_key)
    except RuntimeError as exc:
        app.logger.error("Video storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code in ("NoSuchKey", "404", "NotFound"):
            return jsonify(error="Video file not found"), 404
        app.logger.exception("Could not retrieve video object")
        return jsonify(error="Could not load video from storage."), 502
    except BotoCoreError:
        app.logger.exception("Could not retrieve video object")
        return jsonify(error="Could not load video from storage."), 502

    body = video_object["Body"]

    def stream():
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    headers = {"Cache-Control": "private, max-age=60"}
    if "ContentLength" in video_object:
        headers["Content-Length"] = str(video_object["ContentLength"])
    mimetype = (
        "application/vnd.apple.mpegurl"
        if parts[-1] == "index.m3u8"
        else "video/mp2t"
    )
    return Response(stream(), mimetype=mimetype, headers=headers)


@app.post("/api/videos")
def upload_video():
    video = request.files.get("video")
    parent_folder = request.form.get("parent_folder", "")
    video_folder = request.form.get("video_folder", "").strip()
    if video is None or not video.filename:
        return jsonify(error="Select a video to upload"), 400
    if (
        not parent_folder
        or parent_folder != parent_folder.strip()
        or parent_folder in (".", "..")
        or "/" in parent_folder
        or "\\" in parent_folder
    ):
        return jsonify(error="Select a valid parent folder."), 400
    if (
        not video_folder
        or video_folder in (".", "..")
        or "/" in video_folder
        or "\\" in video_folder
    ):
        return jsonify(error="Enter a valid video folder name."), 400

    try:
        if parent_folder not in get_parent_folders():
            return jsonify(error="Select an existing parent folder."), 400
        folder_name = f"{parent_folder}/{video_folder}"
        if folder_name in get_video_folders():
            return jsonify(error="A video folder with that name already exists under this parent."), 409
        with tempfile.TemporaryDirectory(prefix="trainee_tracker_upload_") as upload_dir:
            video_path = os.path.join(upload_dir, "input_video")
            video.save(video_path)
            upload_video_as_hls(video_path, folder_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError as exc:
        app.logger.error("Video upload configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not access video storage")
        return jsonify(error="Could not access video storage."), 502
    except FileNotFoundError as exc:
        app.logger.error("Required video upload program is unavailable: %s", exc.filename)
        return jsonify(error=f"Required program {exc.filename or 'ffmpeg or rclone'} is not available on the server"), 503
    except subprocess.CalledProcessError:
        app.logger.exception("Video conversion or upload failed")
        return jsonify(error="Video conversion or upload failed. Check the server logs."), 502

    return jsonify(ok=True, folder=folder_name, playlist=f"{folder_name}/index.m3u8")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

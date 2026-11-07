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

from flask import Flask, jsonify, request

from CLOUD_FLARE.modules import upload_video_as_hls

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


@app.post("/api/videos")
def upload_video():
    video = request.files.get("video")
    folder_name = request.form.get("folder_name", "").strip().replace("\\", "/").strip("/")
    if video is None or not video.filename:
        return jsonify(error="Select a video to upload"), 400
    if not folder_name or any(part in ("", ".", "..") for part in folder_name.split("/")):
        return jsonify(error="Enter a valid destination folder name"), 400

    try:
        with tempfile.TemporaryDirectory(prefix="trainee_tracker_upload_") as upload_dir:
            video_path = os.path.join(upload_dir, "input_video")
            video.save(video_path)
            upload_video_as_hls(video_path, folder_name)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError as exc:
        app.logger.error("Video upload configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except FileNotFoundError as exc:
        app.logger.error("Required video upload program is unavailable: %s", exc.filename)
        return jsonify(error=f"Required program {exc.filename or 'ffmpeg or rclone'} is not available on the server"), 503
    except subprocess.CalledProcessError:
        app.logger.exception("Video conversion or upload failed")
        return jsonify(error="Video conversion or upload failed. Check the server logs."), 502

    return jsonify(ok=True, folder=folder_name, playlist=f"{folder_name}/index.m3u8")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

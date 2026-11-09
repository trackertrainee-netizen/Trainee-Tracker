"""Magnus Trainee Tracker - Flask server.

Serves the front end from ./static and stores all trainee data in data.json.
Run:  pip install -r requirements.txt  &&  python app.py
Open: http://localhost:5000
"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

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
UPLOAD_CHUNK_SIZE = 50 * 1024 * 1024
UPLOAD_CHUNK_DIR = os.path.join(tempfile.gettempdir(), "trainee_tracker_upload_chunks")
lock = threading.Lock()
video_jobs = {}
video_jobs_lock = threading.Lock()
VIDEO_JOB_TTL = 60 * 60  # keep finished jobs for an hour

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


def _upload_session_path(upload_id):
    try:
        normalized_id = str(uuid.UUID(upload_id))
    except (ValueError, AttributeError):
        return None
    if normalized_id != upload_id:
        return None
    return os.path.join(UPLOAD_CHUNK_DIR, normalized_id)


def _read_upload_session(upload_id):
    session_dir = _upload_session_path(upload_id)
    if session_dir is None or not os.path.isdir(session_dir):
        return None, None
    try:
        with open(os.path.join(session_dir, "metadata.json"), encoding="utf-8") as f:
            metadata = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return session_dir, None
    return session_dir, metadata if isinstance(metadata, dict) else None


def _update_video_job(job_id, **fields):
    with video_jobs_lock:
        video_jobs[job_id].update(fields, updated=time.time())


def _prune_video_jobs():
    cutoff = time.time() - VIDEO_JOB_TTL
    with video_jobs_lock:
        for job_id in [
            key for key, job in video_jobs.items()
            if job["status"] in ("done", "error") and job["updated"] < cutoff
        ]:
            del video_jobs[job_id]


def _run_video_job(job_id, upload_dir, video_path, folder_name):
    """Background worker: convert to HLS, upload, and record progress."""
    try:
        upload_video_as_hls(
            video_path,
            folder_name,
            progress=lambda stage, percent: _update_video_job(job_id, status=stage, percent=percent),
        )
        _update_video_job(job_id, status="done", percent=100, playlist=f"{folder_name}/index.m3u8")
    except ValueError as exc:
        _update_video_job(job_id, status="error", error=str(exc))
    except RuntimeError as exc:
        app.logger.error("Video upload configuration error: %s", exc)
        _update_video_job(job_id, status="error", error=str(exc))
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not access video storage")
        _update_video_job(job_id, status="error", error="Could not access video storage.")
    except FileNotFoundError as exc:
        app.logger.error("Required video upload program is unavailable: %s", exc.filename)
        _update_video_job(
            job_id,
            status="error",
            error=f"Required program {exc.filename or 'ffmpeg or rclone'} is not available on the server",
        )
    except subprocess.CalledProcessError:
        app.logger.exception("Video conversion or upload failed")
        _update_video_job(job_id, status="error", error="Video conversion or upload failed. Check the server logs.")
    except Exception:
        app.logger.exception("Unexpected video upload failure")
        _update_video_job(job_id, status="error", error="Video upload failed unexpectedly. Check the server logs.")
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


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


@app.post("/api/video-uploads")
def start_video_upload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Invalid video upload details."), 400

    parent_folder = data.get("parent_folder", "")
    video_folder = data.get("video_folder", "")
    file_size = data.get("file_size")
    if (
        not isinstance(parent_folder, str)
        or not parent_folder
        or parent_folder != parent_folder.strip()
        or parent_folder in (".", "..")
        or "/" in parent_folder
        or "\\" in parent_folder
    ):
        return jsonify(error="Select a valid parent folder."), 400
    if (
        not isinstance(video_folder, str)
        or not video_folder
        or video_folder != video_folder.strip()
        or video_folder in (".", "..")
        or "/" in video_folder
        or "\\" in video_folder
    ):
        return jsonify(error="Enter a valid video folder name."), 400
    if isinstance(file_size, bool) or not isinstance(file_size, int) or file_size <= 0:
        return jsonify(error="Select a valid video file."), 400

    try:
        if parent_folder not in get_parent_folders():
            return jsonify(error="Select an existing parent folder."), 400
        folder_name = f"{parent_folder}/{video_folder}"
        if folder_name in get_video_folders():
            return jsonify(error="A video folder with that name already exists under this parent."), 409

        os.makedirs(UPLOAD_CHUNK_DIR, exist_ok=True)
        upload_id = str(uuid.uuid4())
        session_dir = os.path.join(UPLOAD_CHUNK_DIR, upload_id)
        os.mkdir(session_dir)
        metadata = {
            "parent_folder": parent_folder,
            "video_folder": video_folder,
            "file_size": file_size,
            "total_chunks": (file_size + UPLOAD_CHUNK_SIZE - 1) // UPLOAD_CHUNK_SIZE,
        }
        with open(os.path.join(session_dir, "metadata.json"), "w", encoding="utf-8") as f:
            json.dump(metadata, f)
    except RuntimeError as exc:
        app.logger.error("Video upload configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not access video storage")
        return jsonify(error="Could not access video storage."), 502

    return jsonify(upload_id=upload_id, chunk_size=UPLOAD_CHUNK_SIZE), 201


@app.post("/api/video-uploads/<upload_id>/<int:chunk_index>")
def upload_video_chunk(upload_id, chunk_index):
    if request.content_length and request.content_length > UPLOAD_CHUNK_SIZE + 1024 * 1024:
        return jsonify(error="Upload chunk exceeds the 50 MB limit."), 413

    session_dir, metadata = _read_upload_session(upload_id)
    if session_dir is None:
        return jsonify(error="Video upload session not found."), 404
    if metadata is None:
        return jsonify(error="Video upload session is invalid."), 400
    total_chunks = metadata.get("total_chunks")
    if not isinstance(total_chunks, int) or not 0 <= chunk_index < total_chunks:
        return jsonify(error="Invalid upload chunk number."), 400

    chunk = request.files.get("chunk")
    if chunk is None:
        return jsonify(error="Upload chunk is missing."), 400

    expected_size = min(
        UPLOAD_CHUNK_SIZE,
        metadata["file_size"] - chunk_index * UPLOAD_CHUNK_SIZE,
    )
    chunk_path = os.path.join(session_dir, f"chunk_{chunk_index:06d}")
    fd, temporary_path = tempfile.mkstemp(dir=session_dir, suffix=".tmp")
    os.close(fd)
    try:
        chunk.save(temporary_path)
        if os.path.getsize(temporary_path) != expected_size:
            return jsonify(error="Upload chunk has an invalid size."), 400
        try:
            os.link(temporary_path, chunk_path)
        except FileExistsError:
            return jsonify(error="This upload chunk was already received."), 409
    finally:
        if os.path.exists(temporary_path):
            os.remove(temporary_path)

    return jsonify(ok=True, chunk_index=chunk_index), 201


@app.post("/api/video-uploads/<upload_id>/complete")
def complete_video_upload(upload_id):
    session_dir, metadata = _read_upload_session(upload_id)
    if session_dir is None:
        return jsonify(error="Video upload session not found."), 404
    if metadata is None:
        return jsonify(error="Video upload session is invalid."), 400

    folder_name = f"{metadata['parent_folder']}/{metadata['video_folder']}"
    upload_dir = None
    try:
        for chunk_index in range(metadata["total_chunks"]):
            chunk_path = os.path.join(session_dir, f"chunk_{chunk_index:06d}")
            expected_size = min(
                UPLOAD_CHUNK_SIZE,
                metadata["file_size"] - chunk_index * UPLOAD_CHUNK_SIZE,
            )
            if not os.path.isfile(chunk_path) or os.path.getsize(chunk_path) != expected_size:
                return jsonify(error="Video upload is incomplete. Please retry the upload."), 400
        if metadata["file_size"] <= 0:
            return jsonify(error="Select a valid video file."), 400
        if folder_name in get_video_folders():
            return jsonify(error="A video folder with that name already exists under this parent."), 409

        upload_dir = tempfile.mkdtemp(prefix="trainee_tracker_upload_")
        video_path = os.path.join(upload_dir, "input_video")
        with open(video_path, "wb") as assembled:
            for chunk_index in range(metadata["total_chunks"]):
                chunk_path = os.path.join(session_dir, f"chunk_{chunk_index:06d}")
                with open(chunk_path, "rb") as part:
                    shutil.copyfileobj(part, assembled, length=1024 * 1024)
        if os.path.getsize(video_path) != metadata["file_size"]:
            return jsonify(error="Uploaded video size does not match the selected file."), 400

        _prune_video_jobs()
        job_id = str(uuid.uuid4())
        with video_jobs_lock:
            video_jobs[job_id] = {
                "status": "converting",
                "percent": 0,
                "playlist": None,
                "error": None,
                "updated": time.time(),
            }
        threading.Thread(
            target=_run_video_job,
            args=(job_id, upload_dir, video_path, folder_name),
            daemon=True,
        ).start()
        upload_dir = None
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

    finally:
        if upload_dir:
            shutil.rmtree(upload_dir, ignore_errors=True)

    shutil.rmtree(session_dir, ignore_errors=True)
    return jsonify(job_id=job_id), 202


@app.delete("/api/video-uploads/<upload_id>")
def cancel_video_upload(upload_id):
    session_dir = _upload_session_path(upload_id)
    if session_dir is None:
        return jsonify(error="Invalid video upload session."), 400
    if not os.path.isdir(session_dir):
        return jsonify(ok=True)
    shutil.rmtree(session_dir)
    return jsonify(ok=True)


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

    upload_dir = None
    try:
        if parent_folder not in get_parent_folders():
            return jsonify(error="Select an existing parent folder."), 400
        folder_name = f"{parent_folder}/{video_folder}"
        if folder_name in get_video_folders():
            return jsonify(error="A video folder with that name already exists under this parent."), 409

        upload_dir = tempfile.mkdtemp(prefix="trainee_tracker_upload_")
        video_path = os.path.join(upload_dir, "input_video")
        video.save(video_path)

        _prune_video_jobs()
        job_id = str(uuid.uuid4())
        with video_jobs_lock:
            video_jobs[job_id] = {
                "status": "converting",
                "percent": 0,
                "playlist": None,
                "error": None,
                "updated": time.time(),
            }
        threading.Thread(
            target=_run_video_job,
            args=(job_id, upload_dir, video_path, folder_name),
            daemon=True,
        ).start()
        upload_dir = None  # the worker thread now owns and removes it
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError as exc:
        app.logger.error("Video upload configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not access video storage")
        return jsonify(error="Could not access video storage."), 502
    finally:
        if upload_dir:
            shutil.rmtree(upload_dir, ignore_errors=True)

    return jsonify(job_id=job_id), 202


@app.get("/api/video-jobs/<job_id>")
def video_job_status(job_id):
    with video_jobs_lock:
        job = video_jobs.get(job_id)
        job = dict(job) if job else None
    if job is None:
        return jsonify(error="Video upload job not found."), 404
    return jsonify(
        status=job["status"],
        percent=job["percent"],
        playlist=job["playlist"],
        error=job["error"],
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
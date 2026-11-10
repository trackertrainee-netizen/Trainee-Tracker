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
    MAX_PRESENTATION_BYTES,
    create_parent_folder,
    delete_hierarchy_object,
    get_hierarchy_object,
    get_parent_folders,
    get_presentation_object,
    get_video_folders,
    get_video_object,
    upload_hierarchy_image,
    upload_presentation_pdf,
    upload_video_as_hls,
)

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE, "data.json")
VIDEO_MAP_FILE = os.path.join(BASE, "video_map.json")
HIERARCHY_FILE = os.path.join(BASE, "hierarchy_images.json")
# Keep in sync with BUSINESSES in static/config.js
BUSINESSES = ["Magnus", "Alims", "M&D", "Merchx"]
MAX_HIERARCHY_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 200 * 1024 * 1024
UPLOAD_CHUNK_DIR = os.path.join(tempfile.gettempdir(), "trainee_tracker_upload_chunks")
lock = threading.Lock()
video_jobs = {}
video_job_controls = {}
video_upload_jobs = {}
video_upload_controls = {}
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


def read_video_map():
    try:
        with open(VIDEO_MAP_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_video_map(data):
    fd, tmp = tempfile.mkstemp(dir=BASE, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, VIDEO_MAP_FILE)


def read_hierarchy():
    try:
        with open(HIERARCHY_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_hierarchy(data):
    fd, tmp = tempfile.mkstemp(dir=BASE, suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, HIERARCHY_FILE)


def _business_slug(business):
    return "".join(ch.lower() if ch.isalnum() else "-" for ch in business)


def _image_type(data):
    """Detect the image type from its first bytes (SVG is refused on purpose)."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


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
            if job["status"] in ("done", "error", "cancelled") and job["updated"] < cutoff
        ]:
            del video_jobs[job_id]
            video_job_controls.pop(job_id, None)
            for upload_id, mapped_job_id in list(video_upload_jobs.items()):
                if mapped_job_id == job_id:
                    del video_upload_jobs[upload_id]
                    video_upload_controls.pop(upload_id, None)


def _update_video_job_progress(job_id, control, stage, percent):
    with video_jobs_lock:
        job = video_jobs[job_id]
        status = "cancelling" if control["cancel_event"].is_set() else stage
        job.update(status=status, percent=percent, updated=time.time())


def _cancel_video_job(job_id):
    with video_jobs_lock:
        job = video_jobs.get(job_id)
        control = video_job_controls.get(job_id)
        if job is None or control is None:
            return None
        if job["status"] in ("done", "error", "cancelled"):
            return jsonify(ok=True, status=job["status"]), 200
        control["cancel_event"].set()
        job.update(status="cancelling", updated=time.time())
        process = control["process"]

    if process is not None and process.poll() is None:
        try:
            process.terminate()
        except OSError:
            if process.poll() is None:
                app.logger.exception("Could not stop video upload process")
                return jsonify(error="Could not stop the video upload process."), 500

    return jsonify(ok=True, status="cancelling"), 202


def _set_video_job_process(control, process):
    with video_jobs_lock:
        control["process"] = process
        should_stop = process is not None and control["cancel_event"].is_set()
    if should_stop and process.poll() is None:
        try:
            process.terminate()
        except OSError:
            if process.poll() is None:
                app.logger.exception("Could not stop video upload process")


def _start_video_job(job_id, upload_dir, video_path, folder_name, control):
    """Keep the worker alive through graceful shutdown so temp cleanup can finish."""
    thread = threading.Thread(
        target=_run_video_job,
        args=(job_id, upload_dir, video_path, folder_name, control),
        daemon=False,
    )
    thread.start()


def _run_video_job(job_id, upload_dir, video_path, folder_name, control):
    """Background worker: convert to HLS, upload, and record progress."""
    try:
        upload_video_as_hls(
            video_path,
            folder_name,
            progress=lambda stage, percent: _update_video_job_progress(job_id, control, stage, percent),
            cancel_event=control["cancel_event"],
            on_process=lambda process: _set_video_job_process(control, process),
        )
        if control["cancel_event"].is_set():
            _update_video_job(job_id, status="cancelled", error="Upload cancelled.")
        else:
            _update_video_job(job_id, status="done", percent=100, playlist=f"{folder_name}/index.m3u8")
    except InterruptedError:
        _update_video_job(job_id, status="cancelled", error="Upload cancelled.")
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
        if control["cancel_event"].is_set():
            _update_video_job(job_id, status="cancelled", error="Upload cancelled.")
        else:
            app.logger.exception("Video conversion or upload failed")
            _update_video_job(job_id, status="error", error="Video conversion or upload failed. Check the server logs.")
    except Exception:
        if control["cancel_event"].is_set():
            _update_video_job(job_id, status="cancelled", error="Upload cancelled.")
        else:
            app.logger.exception("Unexpected video upload failure")
            _update_video_job(job_id, status="error", error="Video upload failed unexpectedly. Check the server logs.")
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)
        _set_video_job_process(control, None)


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


@app.get("/api/video-map")
def get_video_map():
    with lock:
        return jsonify(read_video_map())


@app.put("/api/video-map")
def put_video_map():
    """Map one task to a video folder, or remove the mapping when folder is null/empty.

    Body: {"business": "Magnus", "key": "0|Marketing introduction", "folder": "HRMS _ MARKETING/INTRO"}
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Invalid mapping details."), 400
    business = body.get("business")
    key = body.get("key")
    folder = body.get("folder")
    if not isinstance(business, str) or not business.strip():
        return jsonify(error="Choose a business."), 400
    if not isinstance(key, str) or not key.strip():
        return jsonify(error="Choose a task."), 400
    if folder is not None and not isinstance(folder, str):
        return jsonify(error="Invalid video folder."), 400
    if folder and (".." in folder.split("/") or folder.startswith("/") or "\\" in folder):
        return jsonify(error="Invalid video folder."), 400
    with lock:
        data = read_video_map()
        mapped = data.setdefault(business, {})
        if folder:
            mapped[key] = folder
        else:
            mapped.pop(key, None)
            if not mapped:
                data.pop(business, None)
        write_video_map(data)
        return jsonify(data)


@app.get("/api/hierarchy-images")
def list_hierarchy_images():
    with lock:
        return jsonify(read_hierarchy())


@app.post("/api/hierarchy-images")
def upload_hierarchy():
    """Upload (or replace) the hierarchy image of one business. Images only."""
    business = request.form.get("business", "")
    upload = request.files.get("file")
    if business not in BUSINESSES:
        return jsonify(error="Choose a valid business."), 400
    if upload is None or not upload.filename:
        return jsonify(error="Select an image to upload."), 400
    if request.content_length and request.content_length > MAX_HIERARCHY_BYTES + 1024 * 1024:
        return jsonify(error="Image must be 10 MB or smaller."), 413
    data = upload.read(MAX_HIERARCHY_BYTES + 1)
    if len(data) > MAX_HIERARCHY_BYTES:
        return jsonify(error="Image must be 10 MB or smaller."), 413
    content_type = _image_type(data)
    if not content_type:
        return jsonify(error="Only PNG, JPG, GIF or WEBP images are allowed."), 400
    try:
        upload_hierarchy_image(_business_slug(business), data, content_type)
    except RuntimeError as exc:
        app.logger.error("Hierarchy storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not store hierarchy image")
        return jsonify(error="Could not save the image to storage."), 502
    entry = {
        "name": os.path.basename(upload.filename)[:120],
        "size": len(data),
        "type": content_type,
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with lock:
        meta = read_hierarchy()
        meta[business] = entry
        write_hierarchy(meta)
        return jsonify(meta)


@app.get("/api/hierarchy-images/<business>")
def view_hierarchy_image(business):
    if business not in BUSINESSES:
        return jsonify(error="Unknown business."), 404
    try:
        obj = get_hierarchy_object(_business_slug(business))
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
            return jsonify(error="Image not found."), 404
        app.logger.exception("Could not read hierarchy image")
        return jsonify(error="Could not load the image from storage."), 502
    except (BotoCoreError, RuntimeError):
        app.logger.exception("Could not read hierarchy image")
        return jsonify(error="Could not load the image from storage."), 502
    body = obj["Body"]

    def stream():
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    headers = {"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"}
    if "ContentLength" in obj:
        headers["Content-Length"] = str(obj["ContentLength"])
    return Response(stream(), mimetype=obj.get("ContentType") or "application/octet-stream", headers=headers)


@app.delete("/api/hierarchy-images/<business>")
def delete_hierarchy_image(business):
    if business not in BUSINESSES:
        return jsonify(error="Unknown business."), 404
    try:
        delete_hierarchy_object(_business_slug(business))
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not delete hierarchy image")
        return jsonify(error="Could not remove the image from storage."), 502
    with lock:
        meta = read_hierarchy()
        meta.pop(business, None)
        write_hierarchy(meta)
        return jsonify(meta)


@app.post("/api/presentations")
def upload_presentation():
    """Trainee presentation upload. PDF only, checked on the server too."""
    upload = request.files.get("file")
    try:
        trainee_id = int(request.form.get("trainee_id", ""))
        step = int(request.form.get("step", ""))
    except ValueError:
        return jsonify(error="Invalid trainee or step."), 400
    if upload is None or not upload.filename:
        return jsonify(error="Select a PDF file to upload."), 400
    if not upload.filename.lower().endswith(".pdf"):
        return jsonify(error="Only PDF files are allowed."), 400
    if request.content_length and request.content_length > MAX_PRESENTATION_BYTES + 1024 * 1024:
        return jsonify(error="PDF must be 25 MB or smaller."), 413

    data = upload.read(MAX_PRESENTATION_BYTES + 1)
    if len(data) > MAX_PRESENTATION_BYTES:
        return jsonify(error="PDF must be 25 MB or smaller."), 413
    if not data.startswith(b"%PDF-"):
        return jsonify(error="That file is not a valid PDF."), 400

    with lock:
        if not any(t.get("id") == trainee_id for t in read_data()):
            return jsonify(error="Trainee not found."), 404

    try:
        upload_presentation_pdf(trainee_id, step, data)
    except RuntimeError as exc:
        app.logger.error("Presentation storage configuration error: %s", exc)
        return jsonify(error=str(exc)), 503
    except (BotoCoreError, ClientError):
        app.logger.exception("Could not store presentation")
        return jsonify(error="Could not save the PDF to storage."), 502
    return jsonify(ok=True, size=len(data))


@app.get("/api/presentations/<int:trainee_id>/<int:step>")
def view_presentation(trainee_id, step):
    try:
        obj = get_presentation_object(trainee_id, step)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "NotFound"):
            return jsonify(error="Presentation not found."), 404
        app.logger.exception("Could not read presentation")
        return jsonify(error="Could not load the PDF from storage."), 502
    except (BotoCoreError, RuntimeError):
        app.logger.exception("Could not read presentation")
        return jsonify(error="Could not load the PDF from storage."), 502

    body = obj["Body"]

    def stream():
        try:
            while True:
                chunk = body.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()

    headers = {
        "Content-Disposition": 'inline; filename="presentation.pdf"',
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
    }
    if "ContentLength" in obj:
        headers["Content-Length"] = str(obj["ContentLength"])
    return Response(stream(), mimetype="application/pdf", headers=headers)


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
        with video_jobs_lock:
            video_upload_controls[upload_id] = {
                "cancel_event": threading.Event(),
                "process": None,
                "phase": "receiving",
            }
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
        return jsonify(error="Upload chunk exceeds the 200 MB limit."), 413

    session_dir, metadata = _read_upload_session(upload_id)
    if session_dir is None:
        return jsonify(error="Video upload session not found."), 404
    if metadata is None:
        return jsonify(error="Video upload session is invalid."), 400
    with video_jobs_lock:
        control = video_upload_controls.get(upload_id)
    if control is not None and control["cancel_event"].is_set():
        return jsonify(error="Video upload cancelled."), 409
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
        if control is not None and control["cancel_event"].is_set():
            return jsonify(error="Video upload cancelled."), 409
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
    with video_jobs_lock:
        control = video_upload_controls.setdefault(
            upload_id,
            {"cancel_event": threading.Event(), "process": None, "phase": "receiving"},
        )
        control["phase"] = "assembling"

    folder_name = f"{metadata['parent_folder']}/{metadata['video_folder']}"
    upload_dir = None
    try:
        if control["cancel_event"].is_set():
            return jsonify(error="Video upload cancelled."), 409
        for chunk_index in range(metadata["total_chunks"]):
            if control["cancel_event"].is_set():
                return jsonify(error="Video upload cancelled."), 409
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
                if control["cancel_event"].is_set():
                    return jsonify(error="Video upload cancelled."), 409
                chunk_path = os.path.join(session_dir, f"chunk_{chunk_index:06d}")
                with open(chunk_path, "rb") as part:
                    while True:
                        if control["cancel_event"].is_set():
                            return jsonify(error="Video upload cancelled."), 409
                        chunk = part.read(1024 * 1024)
                        if not chunk:
                            break
                        assembled.write(chunk)
        if control["cancel_event"].is_set():
            return jsonify(error="Video upload cancelled."), 409
        if os.path.getsize(video_path) != metadata["file_size"]:
            return jsonify(error="Uploaded video size does not match the selected file."), 400

        _prune_video_jobs()
        job_id = str(uuid.uuid4())
        with video_jobs_lock:
            control["phase"] = "processing"
            video_jobs[job_id] = {
                "status": "converting",
                "percent": 0,
                "playlist": None,
                "error": None,
                "updated": time.time(),
            }
            video_job_controls[job_id] = control
            video_upload_jobs[upload_id] = job_id
        _start_video_job(job_id, upload_dir, video_path, folder_name, control)
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
        if control["cancel_event"].is_set():
            shutil.rmtree(session_dir, ignore_errors=True)
            with video_jobs_lock:
                if upload_id not in video_upload_jobs:
                    video_upload_controls.pop(upload_id, None)

    shutil.rmtree(session_dir, ignore_errors=True)
    return jsonify(job_id=job_id), 202


@app.delete("/api/video-uploads/<upload_id>")
def cancel_video_upload(upload_id):
    session_dir = _upload_session_path(upload_id)
    if session_dir is None:
        return jsonify(error="Invalid video upload session."), 400
    with video_jobs_lock:
        job_id = video_upload_jobs.get(upload_id)
        control = video_upload_controls.get(upload_id)
    if job_id is not None:
        cancellation = _cancel_video_job(job_id)
        if cancellation is not None:
            return cancellation
    if control is not None:
        control["cancel_event"].set()
        if control["phase"] == "assembling":
            return jsonify(ok=True, status="cancelling"), 202
    if not os.path.isdir(session_dir):
        with video_jobs_lock:
            video_upload_controls.pop(upload_id, None)
        return jsonify(ok=True)
    shutil.rmtree(session_dir, ignore_errors=True)
    with video_jobs_lock:
        video_upload_controls.pop(upload_id, None)
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
        control = {
            "cancel_event": threading.Event(),
            "process": None,
            "phase": "processing",
        }
        with video_jobs_lock:
            video_jobs[job_id] = {
                "status": "converting",
                "percent": 0,
                "playlist": None,
                "error": None,
                "updated": time.time(),
            }
            video_job_controls[job_id] = control
        _start_video_job(job_id, upload_dir, video_path, folder_name, control)
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


@app.delete("/api/video-jobs/<job_id>")
def cancel_video_job(job_id):
    cancellation = _cancel_video_job(job_id)
    if cancellation is None:
        return jsonify(error="Video upload job not found."), 404
    return cancellation
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
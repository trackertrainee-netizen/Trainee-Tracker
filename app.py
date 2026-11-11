"""Magnus Trainee Tracker - Flask server backed by Supabase."""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, make_response, request
from postgrest.exceptions import APIError
from supabase import AuthApiError, create_client
from storage3.exceptions import StorageException

from DATA_BASE.db import DataBase, trainee_auth_email

from CLOUD_FLARE.modules import (
    MAX_PRESENTATION_BYTES,
    create_parent_folder,
    delete_hierarchy_object,
    get_hierarchy_object,
    get_parent_folders,
    get_video_folders,
    get_video_object,
    upload_hierarchy_image,
    upload_video_as_hls,
)

BASE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE, ".env"))
VIDEO_MAP_FILE = os.path.join(BASE, "video_map.json")
HIERARCHY_FILE = os.path.join(BASE, "hierarchy_images.json")
PRESENTATION_BUCKET = "presentations"
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
ACCESS_COOKIE = "mt_access"
REFRESH_COOKIE = "mt_refresh"
DEVELOPER_AUTH_EMAIL = os.environ.get(
    "DEVELOPER_AUTH_EMAIL", "developer@trainee-tracker.invalid"
)


def _db(access_token=None):
    return DataBase(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_KEY"),
        access_token,
    )


@app.before_request
def authenticate_api_request():
    if not request.path.startswith("/api/") or request.path in ("/api/login", "/api/logout"):
        return None

    authorization = request.headers.get("Authorization", "")
    if not authorization:
        authorization = "Bearer " + request.cookies.get(ACCESS_COOKIE, "")
    if not authorization.startswith("Bearer ") or not authorization[7:].strip():
        return jsonify(error="Sign in to continue."), 401

    token = authorization[7:].strip()
    try:
        database = _db(token)
        try:
            user = database.current_user(token)
        except AuthApiError:
            refresh_token = request.cookies.get(REFRESH_COOKIE)
            if not refresh_token:
                raise
            refreshed = _db().client.auth.refresh_session(refresh_token)
            token = refreshed.session.access_token
            g.refreshed_session = refreshed.session
            database = _db(token)
            user = database.current_user(token)
        profile = database.profile(user.id)
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 503
    except AuthApiError:
        return jsonify(error="Your session expired. Please sign in again."), 401
    except APIError:
        app.logger.exception("Could not load the signed-in user's profile")
        return jsonify(error="Could not load your account profile."), 502

    if not profile:
        return jsonify(error="No application profile is linked to this account."), 403
    g.database = database
    g.auth_user = user
    g.profile = profile


@app.after_request
def refresh_auth_cookies(response):
    session = getattr(g, "refreshed_session", None)
    if session:
        response.set_cookie(
            ACCESS_COOKIE,
            session.access_token,
            httponly=True,
            secure=True,
            samesite="Strict",
            max_age=session.expires_in,
        )
        response.set_cookie(
            REFRESH_COOKIE,
            session.refresh_token,
            httponly=True,
            secure=True,
            samesite="Strict",
            max_age=30 * 24 * 60 * 60,
        )
    return response


def _profile_payload(database, profile):
    result = dict(profile)
    for field, table in (
        ("business_id", "businesses"),
        ("branch_id", "branches"),
        ("department_id", "departments"),
    ):
        value = result.get(field)
        result[field.replace("_id", "")] = None
        if value:
            row = (
                database.client.table(table)
                .select("id,name")
                .eq("id", value)
                .maybe_single()
                .execute()
                .data
            )
            result[field.replace("_id", "")] = row
    return result


def _is_developer():
    return g.profile["role"] == "developer"


def _business_names():
    return {row["name"] for row in g.database.list_options()["businesses"]}


def _can_access_business(name):
    try:
        return _is_developer() or name in _business_names()
    except APIError:
        app.logger.exception("Could not verify business scope")
        return False


def _require_developer():
    if not _is_developer():
        return jsonify(error="Only a developer account can perform this action."), 403
    return None


def _require_org_manager():
    if g.profile["role"] not in ("developer", "business"):
        return jsonify(error="Only a developer or business account can perform this action."), 403
    return None


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


def _presentation_key(trainee_name, trainee_id, step):
    folder_name = trainee_name.strip().replace("/", "-").replace("\\", "-")
    if not folder_name or folder_name in (".", ".."):
        raise ValueError("The trainee must have a valid name to store presentations.")
    return f"{folder_name}/{trainee_id}/{step}.pdf"


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


@app.post("/api/login")
def login():
    body = request.get_json(silent=True)
    identifier = body.get("username", body.get("email", "")).strip() if isinstance(body, dict) else ""
    password = body.get("password", "") if isinstance(body, dict) else ""
    if not identifier or not password:
        return jsonify(error="Enter your username and password."), 400
    if "@" in identifier:
        email = identifier
    elif identifier.casefold() == "developer":
        email = DEVELOPER_AUTH_EMAIL
    else:
        email = trainee_auth_email(identifier)
    try:
        database = _db()
        auth = database.sign_in(email, password)
        profile = database.profile(auth.user.id)
        if not profile:
            return jsonify(error="No application profile is linked to this account."), 403
        response = make_response(jsonify(
            user=_profile_payload(database, profile),
        ))
        response.set_cookie(
            ACCESS_COOKIE,
            auth.session.access_token,
            httponly=True,
            secure=True,
            samesite="Strict",
            max_age=auth.session.expires_in,
        )
        response.set_cookie(
            REFRESH_COOKIE,
            auth.session.refresh_token,
            httponly=True,
            secure=True,
            samesite="Strict",
            max_age=30 * 24 * 60 * 60,
        )
        return response
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 503
    except AuthApiError:
        return jsonify(error="Incorrect email or password."), 401
    except APIError:
        app.logger.exception("Supabase rejected the login request")
        return jsonify(error="Could not sign in. Check the Supabase configuration."), 502


@app.post("/api/logout")
def logout():
    response = make_response(jsonify(ok=True))
    response.delete_cookie(
        ACCESS_COOKIE, httponly=True, secure=True, samesite="Strict"
    )
    response.delete_cookie(
        REFRESH_COOKIE, httponly=True, secure=True, samesite="Strict"
    )
    return response


@app.get("/api/session")
def get_session():
    try:
        return jsonify(user=_profile_payload(g.database, g.profile))
    except APIError:
        app.logger.exception("Could not load the signed-in user's scope")
        return jsonify(error="Could not load your account scope."), 502


@app.get("/api/options")
def get_options():
    try:
        return jsonify(g.database.list_options())
    except APIError:
        app.logger.exception("Could not load organization options from Supabase")
        return jsonify(error="Could not load organization options."), 502


@app.post("/api/organization")
def create_organization_record():
    denied = _require_org_manager()
    if denied:
        return denied
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Invalid organization details."), 400
    try:
        records = g.database.create_organization_record(
            body.get("entity"), body.get("name"), body.get("parent_id")
        )
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except APIError as exc:
        if getattr(exc, "code", None) == "42501":
            return jsonify(error="Your account is not allowed to manage organization records."), 403
        if getattr(exc, "code", None) == "23505":
            return jsonify(error="That organization record already exists."), 409
        if getattr(exc, "code", None) == "23503":
            return jsonify(error="Choose an existing parent organization."), 400
        app.logger.exception("Could not create an organization record")
        return jsonify(error="Could not create the organization record."), 502
    if not records:
        app.logger.error("Supabase created no organization record for entity %s", body.get("entity"))
        return jsonify(error="The organization record was not returned after creation."), 502
    return jsonify(record=records[0]), 201


USER_ROLES = ("developer", "business", "business_view")


@app.post("/api/users")
def create_user_account():
    """Create a sign-in account (Supabase Auth user + profile) for staff roles."""
    denied = _require_org_manager()
    if denied:
        return denied
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify(error="Invalid user details."), 400

    username = " ".join(str(body.get("username") or "").split())
    password = str(body.get("password") or "")
    role = str(body.get("role") or "")
    business_id = body.get("business_id") or None
    if not username or "@" in username or username.casefold() == "developer":
        return jsonify(error="Enter a valid username (no @, and not \"developer\")."), 400
    if len(password) < 6:
        return jsonify(error="Password must be at least 6 characters."), 400
    if role not in USER_ROLES:
        return jsonify(error="Choose a valid role."), 400

    if _is_developer():
        if role != "developer" and not business_id:
            return jsonify(error="Choose a business for this user."), 400
        if role == "developer":
            business_id = None
    else:
        # Business accounts can only add Business / Business viewer users in their own business.
        if role == "developer":
            return jsonify(error="Only a developer can create developer accounts."), 403
        business_id = g.profile.get("business_id")
        if not business_id:
            return jsonify(error="Your account has no business scope."), 403

    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        return jsonify(error="SUPABASE_SERVICE_ROLE_KEY is not configured on the server."), 503
    try:
        if business_id:
            business = (
                g.database.client.table("businesses")
                .select("id,name")
                .eq("id", business_id)
                .maybe_single()
                .execute()
                .data
            )
            if not business:
                return jsonify(error="Choose an existing business."), 400
        admin = create_client(os.environ.get("SUPABASE_URL"), service_key)
        auth_user = admin.auth.admin.create_user({
            "email": trainee_auth_email(username),
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": username, "full_name": username},
        })
        profile = {
            "id": auth_user.user.id,
            "full_name": username,
            "role": role,
            "business_id": business_id,
        }
        try:
            admin.table("profiles").upsert(profile).execute()
        except Exception:
            admin.auth.admin.delete_user(auth_user.user.id)
            raise
    except AuthApiError as exc:
        app.logger.warning("Could not create user in Supabase Auth: %s", exc)
        message = str(getattr(exc, "message", exc)).lower()
        if "already" in message or "registered" in message or "exists" in message:
            return jsonify(error="That username is already taken."), 409
        return jsonify(error="Could not create the user account."), 502
    except APIError:
        app.logger.exception("Could not create the user profile")
        return jsonify(error="Could not create the user profile."), 502
    return jsonify(ok=True, username=username, role=role), 201


@app.get("/api/trainees")
def get_trainees():
    try:
        trainees = g.database.list_trainees()
        if g.profile["role"] not in ("developer", "business"):
            for trainee in trainees:
                trainee.pop("sal", None)
                trainee.pop("wage", None)
        return jsonify(trainees)
    except APIError:
        app.logger.exception("Could not load trainee workflow from Supabase")
        return jsonify(error="Could not load trainees from the database."), 502


@app.post("/api/trainees/<trainee_id>/account")
def set_trainee_login(trainee_id):
    if g.profile["role"] not in ("developer", "business"):
        return jsonify(error="Only a developer or business account can set trainee login passwords."), 403

    body = request.get_json(silent=True)
    password = body.get("password") if isinstance(body, dict) else None
    try:
        normalized_id = str(uuid.UUID(trainee_id))
    except (ValueError, TypeError, AttributeError):
        return jsonify(error="Choose a valid trainee."), 400
    if normalized_id != trainee_id:
        return jsonify(error="Choose a valid trainee."), 400

    try:
        trainee = next(
            (row for row in g.database.list_trainees() if row.get("id") == normalized_id),
            None,
        )
        if not trainee:
            return jsonify(error="Trainee not found or not in your scope."), 404
        if g.profile["role"] == "business":
            scope = _profile_payload(g.database, g.profile)
            for field in ("business", "branch", "department"):
                allowed = scope.get(field)
                if allowed and trainee.get({"business": "biz", "branch": "branch", "department": "dept"}[field]) != allowed.get("name"):
                    return jsonify(error="That trainee is outside your account scope."), 403
                if field == "business" and not allowed:
                    return jsonify(error="Your account has no business scope."), 403

        username = g.database.set_trainee_login(normalized_id, password)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError as exc:
        app.logger.error("Trainee account configuration or cleanup error: %s", exc)
        return jsonify(error=str(exc)), 503
    except AuthApiError:
        app.logger.exception("Could not set trainee login in Supabase Auth")
        return jsonify(error="Could not set the trainee login password."), 502
    except APIError:
        app.logger.exception("Could not set trainee login in Supabase")
        return jsonify(error="Could not set the trainee login password."), 502
    return jsonify(ok=True, username=username)


@app.put("/api/trainees")
def put_trainees():
    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify(error="Expected a JSON list of trainees"), 400
    try:
        count = g.database.save_trainees(data, g.profile)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError as exc:
        app.logger.error("Trainee account configuration or cleanup error: %s", exc)
        return jsonify(error=str(exc)), 503
    except AuthApiError:
        app.logger.exception("Could not create trainee login in Supabase Auth")
        return jsonify(error="Could not create the trainee login account."), 502
    except APIError as exc:
        app.logger.exception("Could not save trainee workflow to Supabase")
        if getattr(exc, "code", None) == "42501":
            return jsonify(error="Your account is not allowed to make that change."), 403
        return jsonify(error="Could not save trainee workflow to the database."), 502
    return jsonify(ok=True, count=count)


@app.get("/api/video-map")
def get_video_map():
    with lock:
        data = read_video_map()
    if _is_developer():
        return jsonify(data)
    try:
        names = _business_names()
    except APIError:
        app.logger.exception("Could not check video mapping scope")
        return jsonify(error="Could not load video mappings."), 502
    return jsonify({name: value for name, value in data.items() if name in names})


@app.put("/api/video-map")
def put_video_map():
    """Map one task to a video folder, or remove the mapping when folder is null/empty.

    Body: {"business": "Magnus", "key": "0|Marketing introduction", "folder": "HRMS _ MARKETING/INTRO"}
    """
    denied = _require_developer()
    if denied:
        return denied
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
        data = read_hierarchy()
    if _is_developer():
        return jsonify(data)
    try:
        names = _business_names()
    except APIError:
        app.logger.exception("Could not check hierarchy image scope")
        return jsonify(error="Could not load hierarchy images."), 502
    return jsonify({name: value for name, value in data.items() if name in names})


@app.post("/api/hierarchy-images")
def upload_hierarchy():
    """Upload (or replace) the hierarchy image of one business. Images only."""
    business = request.form.get("business", "")
    upload = request.files.get("file")
    if g.profile["role"] not in ("developer", "business"):
        return jsonify(error="Your account cannot upload hierarchy images."), 403
    if not _can_access_business(business):
        return jsonify(error="That business is outside your account scope."), 403
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
    if not _can_access_business(business):
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
    if g.profile["role"] not in ("developer", "business"):
        return jsonify(error="Your account cannot remove hierarchy images."), 403
    if not _can_access_business(business):
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
    if g.profile["role"] != "trainee":
        return jsonify(error="Only the linked trainee can upload a presentation."), 403
    upload = request.files.get("file")
    trainee_id = request.form.get("trainee_id", "").strip()
    if trainee_id != g.profile.get("trainee_id"):
        return jsonify(error="You can upload presentations only to your own trainee record."), 403
    try:
        normalized_id = str(uuid.UUID(trainee_id))
        step = int(request.form.get("step", ""))
    except ValueError:
        return jsonify(error="Invalid trainee or step."), 400
    if normalized_id != trainee_id or step < 0:
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

    try:
        trainee = (
            g.database.client.table("trainees")
            .select("id,name")
            .eq("id", trainee_id)
            .maybe_single()
            .execute()
            .data
        )
    except APIError:
        app.logger.exception("Could not check presentation upload scope")
        return jsonify(error="Could not verify access to this trainee."), 502
    if not trainee:
        return jsonify(error="Trainee not found or not in your scope."), 404

    try:
        key = _presentation_key(trainee["name"], trainee_id, step)
        g.database.client.storage.from_(PRESENTATION_BUCKET).upload(
            key,
            data,
            file_options={"content-type": "application/pdf", "upsert": "true"},
        )
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except StorageException:
        app.logger.exception("Could not store presentation")
        return jsonify(error="Could not save the PDF to storage."), 502
    return jsonify(ok=True, size=len(data))


@app.get("/api/presentations/<trainee_id>/<int:step>")
def view_presentation(trainee_id, step):
    try:
        normalized_id = str(uuid.UUID(trainee_id))
    except ValueError:
        return jsonify(error="Invalid trainee ID."), 400
    if normalized_id != trainee_id or step < 0:
        return jsonify(error="Invalid trainee or step."), 400
    try:
        trainee = (
            g.database.client.table("trainees")
            .select("id,name")
            .eq("id", trainee_id)
            .maybe_single()
            .execute()
            .data
        )
    except APIError:
        app.logger.exception("Could not check presentation read scope")
        return jsonify(error="Could not verify access to this trainee."), 502
    if not trainee:
        return jsonify(error="Trainee not found or not in your scope."), 404
    try:
        key = _presentation_key(trainee["name"], trainee_id, step)
        data = g.database.client.storage.from_(PRESENTATION_BUCKET).download(key)
    except StorageException as exc:
        if str(getattr(exc, "status", "")) == "404":
            return jsonify(error="Presentation not found."), 404
        app.logger.exception("Could not read presentation")
        return jsonify(error="Could not load the PDF from storage."), 502
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except RuntimeError:
        app.logger.exception("Could not read presentation")
        return jsonify(error="Could not load the PDF from storage."), 502

    headers = {
        "Content-Disposition": 'inline; filename="presentation.pdf"',
        "Cache-Control": "private, no-cache",
        "X-Content-Type-Options": "nosniff",
    }
    headers["Content-Length"] = str(len(data))
    return Response(data, mimetype="application/pdf", headers=headers)


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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
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
    denied = _require_developer()
    if denied:
        return denied
    cancellation = _cancel_video_job(job_id)
    if cancellation is None:
        return jsonify(error="Video upload job not found."), 404
    return cancellation
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
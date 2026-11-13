import glob
import os
import re
import shutil
import subprocess
import tempfile

import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("ACCESS_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
BUCKET_NAME = os.getenv("BUCKET_NAME")
ACCOUNT_ID = os.getenv("ACCOUNT_ID")

MAX_PRESENTATION_BYTES = 25 * 1024 * 1024
HIERARCHY_PREFIX = "hierarchy"
PRESENTATION_PREFIX = "presentations"
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _tool_path(name):
    executable = name + ".exe" if os.name == "nt" else name
    bundled = os.path.join(PROJECT_ROOT, "bin", executable)
    if os.path.isfile(bundled):
        return bundled
    on_path = shutil.which(name)
    if on_path:
        return on_path
    if os.name == "nt" and name == "rclone":
        winget_root = os.path.join(
            os.getenv("LOCALAPPDATA", ""),
            "Microsoft", "WinGet", "Packages", "Rclone.Rclone_*",
            "rclone-*-windows-amd64", executable,
        )
        installed = glob.glob(winget_root)
        if installed:
            return max(installed, key=os.path.getmtime)
    return name


def _get_s3_client():
    if not all((ACCESS_KEY, SECRET_KEY, BUCKET_NAME, ACCOUNT_ID)):
        raise RuntimeError("ACCESS_KEY, SECRET_KEY, BUCKET_NAME, and ACCOUNT_ID must be configured.")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        region_name="auto",
    )


def get_all_objects():
    """List all objects in the specified S3 bucket."""
    try:
        response = _get_s3_client().list_objects_v2(Bucket=BUCKET_NAME)
        return response.get("Contents", [])
    except Exception as e:
        print(f"Error listing objects: {e}")
        return []



def get_objects_path():
    try:
        paths = []
        paginator = _get_s3_client().get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket = BUCKET_NAME):
            for obj in page.get("Contents", []):
                paths.append(obj["Key"])

        return paths
    except Exception as e:
        print(f"Error getting object paths: {e}")
        return []


def get_video_folders():
    """Return folders that contain an HLS playlist."""
    client = _get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    folders = set()
    for page in paginator.paginate(Bucket=BUCKET_NAME):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/index.m3u8"):
                folders.add(key[:-len("/index.m3u8")])
    return sorted(folders)


def get_parent_folders():
    """Return top-level folders available for video uploads."""
    client = _get_s3_client()
    paginator = client.get_paginator("list_objects_v2")
    folders = set()
    for page in paginator.paginate(Bucket=BUCKET_NAME, Delimiter="/"):
        for prefix in page.get("CommonPrefixes", []):
            folder = prefix["Prefix"].rstrip("/")
            if folder and folder != PRESENTATION_PREFIX:
                folders.add(folder)
    return sorted(folders)


def create_parent_folder(folder_name):
    """Create an empty top-level folder marker in the bucket."""
    folder_name = os.fspath(folder_name)
    if (
        not folder_name
        or folder_name != folder_name.strip()
        or folder_name in (".", "..")
        or "/" in folder_name
        or "\\" in folder_name
    ):
        raise ValueError("Enter a valid parent folder name.")
    if folder_name in get_parent_folders():
        raise FileExistsError("That parent folder already exists.")

    _get_s3_client().put_object(
        Bucket=BUCKET_NAME,
        Key=f"{folder_name}/",
        Body=b"",
    )


def upload_hierarchy_image(slug, data, content_type):
    """Store a business hierarchy image or PDF in the R2 bucket."""
    _get_s3_client().put_object(
        Bucket=BUCKET_NAME,
        Key=f"{HIERARCHY_PREFIX}/{slug}",
        Body=data,
        ContentType=content_type,
    )


def get_hierarchy_object(slug):
    return _get_s3_client().get_object(Bucket=BUCKET_NAME, Key=f"{HIERARCHY_PREFIX}/{slug}")


def delete_hierarchy_object(slug):
    _get_s3_client().delete_object(Bucket=BUCKET_NAME, Key=f"{HIERARCHY_PREFIX}/{slug}")


def get_video_object(object_key):
    """Get one HLS playlist or segment from the configured bucket."""
    return _get_s3_client().get_object(Bucket=BUCKET_NAME, Key=object_key)


def _rclone_env():
    if not all((ACCESS_KEY, SECRET_KEY, BUCKET_NAME, ACCOUNT_ID)):
        raise RuntimeError("ACCESS_KEY, SECRET_KEY, BUCKET_NAME, and ACCOUNT_ID must be configured.")

    env = os.environ.copy()
    env.update({
        "RCLONE_CONFIG_R2_TYPE": "s3",
        "RCLONE_CONFIG_R2_PROVIDER": "Cloudflare",
        "RCLONE_CONFIG_R2_ACCESS_KEY_ID": ACCESS_KEY,
        "RCLONE_CONFIG_R2_SECRET_ACCESS_KEY": SECRET_KEY,
        "RCLONE_CONFIG_R2_ENDPOINT": f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com",
        "RCLONE_CONFIG_R2_REGION": "auto",
    })
    return env


def _raise_if_cancelled(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise InterruptedError("Upload cancelled.")


def upload_directory_to_s3(directory_path, s3_path, env, progress, cancel_event=None, on_process=None):
    """Upload a directory with one rclone process and report its transfer progress."""
    _raise_if_cancelled(cancel_event)
    command = [
        _tool_path("rclone"), "copy", os.fspath(directory_path), f"r2:{BUCKET_NAME}/{s3_path}",
        "--stats", "1s", "--stats-one-line", "--stats-log-level", "NOTICE",
        "--log-level", "NOTICE",
    ]
    with subprocess.Popen(
        command,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    ) as process:
        if on_process:
            on_process(process)
        try:
            for line in process.stdout:
                _raise_if_cancelled(cancel_event)
                line = line.rstrip()
                match = re.search(r"\bTransferred:.*?,\s*(\d{1,3})%", line)
                if match:
                    progress(min(99, int(match.group(1))))
                elif line:
                    print(line)
            return_code = process.wait()
        finally:
            if on_process:
                on_process(None)

    _raise_if_cancelled(cancel_event)
    if return_code:
        raise subprocess.CalledProcessError(return_code, command)
    progress(100)


def _video_duration(file_path):
    """Duration in seconds, or None if it cannot be determined."""
    try:
        out = subprocess.run(
            [_tool_path("ffprobe"), "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", os.fspath(file_path)],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        duration = float(out)
        return duration if duration > 0 else None
    except (subprocess.CalledProcessError, ValueError):
        return None


def _run_ffmpeg_hls(cmd, duration, on_percent, cancel_event=None, on_process=None):
    """Run ffmpeg and report 0-100 from its -progress output."""
    _raise_if_cancelled(cancel_event)
    with tempfile.TemporaryFile() as err_file:
        proc = subprocess.Popen(
            cmd + ["-progress", "pipe:1", "-nostats", "-loglevel", "error"],
            stdout=subprocess.PIPE, stderr=err_file, text=True,
        )
        if on_process:
            on_process(proc)
        try:
            last = -1
            for line in proc.stdout:
                _raise_if_cancelled(cancel_event)
                key, _, value = line.strip().partition("=")
                if key in ("out_time_us", "out_time_ms") and duration and value.lstrip("-").isdigit():
                    percent = min(99, max(0, int(int(value) / 1_000_000 / duration * 100)))
                    if percent != last:
                        last = percent
                        on_percent(percent)
            code = proc.wait()
            if code != 0:
                err_file.seek(0)
                print(err_file.read().decode(errors="replace"))
                _raise_if_cancelled(cancel_event)
                raise subprocess.CalledProcessError(code, cmd[0])
        finally:
            if on_process:
                on_process(None)
    _raise_if_cancelled(cancel_event)
    on_percent(100)


def upload_video_as_hls(file_path, folder_name, progress=None, cancel_event=None, on_process=None):
    """Transcode a video to HLS and upload its playlist and segments to a custom folder.

    progress, if given, is called as progress(stage, percent) where stage is
    "converting" (ffmpeg splitting into HLS) or "uploading" (rclone to R2)
    and percent is 0-100 within that stage.
    """
    report = progress or (lambda stage, percent: None)
    _raise_if_cancelled(cancel_event)
    folder_name = os.fspath(folder_name).replace("\\", "/").strip("/")
    if not folder_name or any(part in ("", ".", "..") for part in folder_name.split("/")):
        raise ValueError("folder_name must be a valid folder path.")

    env = _rclone_env()
    with tempfile.TemporaryDirectory(prefix="trainee_tracker_hls_") as hls_dir:
        playlist_path = os.path.join(hls_dir, "index.m3u8")
        segment_pattern = os.path.join(hls_dir, "segment_%03d.ts")
        _raise_if_cancelled(cancel_event)
        report("converting", 0)
        _run_ffmpeg_hls(
            [
                _tool_path("ffmpeg"), "-y", "-nostdin", "-i", os.fspath(file_path),
                "-map", "0:v:0", "-map", "0:a:0?",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                "-c:a", "aac", "-sc_threshold", "0",
                "-force_key_frames", "expr:gte(t,n_forced*6)",
                "-hls_time", "6", "-hls_playlist_type", "vod",
                "-hls_flags", "independent_segments",
                "-hls_segment_filename", segment_pattern,
                playlist_path,
            ],
            _video_duration(file_path),
            lambda percent: report("converting", percent),
            cancel_event,
            on_process,
        )
        report("uploading", 0)
        upload_directory_to_s3(
            hls_dir,
            folder_name,
            env,
            lambda percent: report("uploading", percent),
            cancel_event,
            on_process,
        )
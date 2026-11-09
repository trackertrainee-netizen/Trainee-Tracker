import json
import os
import subprocess
import tempfile

import boto3
from dotenv import load_dotenv

load_dotenv()

ACCESS_KEY = os.getenv("ACCESS_KEY")
SECRET_KEY = os.getenv("SECRET_KEY")
BUCKET_NAME = os.getenv("BUCKET_NAME")
ACCOUNT_ID = os.getenv("ACCOUNT_ID")


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
            if folder:
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


def upload_file_to_s3(file_path, s3_key):
    """Upload a file to the configured Cloudflare R2 bucket with rclone."""
    subprocess.run(
        ["rclone", "copyto", os.fspath(file_path), f"r2:{BUCKET_NAME}/{s3_key}"],
        env=_rclone_env(),
        check=True,
    )


def _can_copy_to_hls(file_path):
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=codec_type,codec_name,pix_fmt", "-of", "json",
            os.fspath(file_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    streams = json.loads(probe.stdout).get("streams", [])
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if video is None:
        return False

    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    return (
        video.get("codec_name") == "h264"
        and video.get("pix_fmt") in ("yuv420p", "yuvj420p")
        and (audio is None or audio.get("codec_name") == "aac")
    )


def _video_duration(file_path):
    """Duration in seconds, or None if it cannot be determined."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", os.fspath(file_path)],
            check=True, capture_output=True, text=True,
        ).stdout.strip()
        duration = float(out)
        return duration if duration > 0 else None
    except (subprocess.CalledProcessError, ValueError):
        return None


def _run_ffmpeg_hls(cmd, duration, on_percent):
    """Run ffmpeg and report 0-100 from its -progress output."""
    with tempfile.TemporaryFile() as err_file:
        proc = subprocess.Popen(
            cmd + ["-progress", "pipe:1", "-nostats", "-loglevel", "error"],
            stdout=subprocess.PIPE, stderr=err_file, text=True,
        )
        last = -1
        for line in proc.stdout:
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
            raise subprocess.CalledProcessError(code, cmd[0])
    on_percent(100)


def _run_rclone_copy(source_dir, destination, env, on_percent):
    """Run rclone copy and report 0-100 from its JSON stats log."""
    proc = subprocess.Popen(
        ["rclone", "copy", source_dir, destination,
         "--use-json-log", "-v", "--stats", "500ms"],
        env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
    )
    last = -1
    for line in proc.stderr:
        try:
            stats = json.loads(line).get("stats")
        except ValueError:
            continue
        if not stats or not stats.get("totalBytes"):
            continue
        percent = min(99, int(stats.get("bytes", 0) / stats["totalBytes"] * 100))
        if percent != last:
            last = percent
            on_percent(percent)
    code = proc.wait()
    if code != 0:
        raise subprocess.CalledProcessError(code, "rclone")
    on_percent(100)


def upload_video_as_hls(file_path, folder_name, progress=None):
    """Transcode a video to HLS and upload its playlist and segments to a custom folder.

    progress, if given, is called as progress(stage, percent) where stage is
    "converting" (ffmpeg splitting into HLS) or "uploading" (rclone to R2)
    and percent is 0-100 within that stage.
    """
    report = progress or (lambda stage, percent: None)
    folder_name = os.fspath(folder_name).replace("\\", "/").strip("/")
    if not folder_name or any(part in ("", ".", "..") for part in folder_name.split("/")):
        raise ValueError("folder_name must be a valid folder path.")

    env = _rclone_env()
    with tempfile.TemporaryDirectory(prefix="trainee_tracker_hls_") as hls_dir:
        playlist_path = os.path.join(hls_dir, "index.m3u8")
        segment_pattern = os.path.join(hls_dir, "segment_%03d.ts")
        can_copy = _can_copy_to_hls(file_path)
        codec_args = (
            ["-c:v", "copy", "-c:a", "copy"]
            if can_copy
            else ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac"]
        )
        report("converting", 0)
        _run_ffmpeg_hls(
            [
                "ffmpeg", "-y", "-nostdin", "-i", os.fspath(file_path),
                "-map", "0:v:0", "-map", "0:a:0?",
                *codec_args,
                "-hls_time", "6", "-hls_playlist_type", "vod",
                "-hls_flags", "independent_segments",
                "-hls_segment_filename", segment_pattern,
                playlist_path,
            ],
            _video_duration(file_path),
            lambda percent: report("converting", percent),
        )
        report("uploading", 0)
        _run_rclone_copy(
            hls_dir,
            f"r2:{BUCKET_NAME}/{folder_name}",
            env,
            lambda percent: report("uploading", percent),
        )
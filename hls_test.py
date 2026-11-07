import os
import subprocess


def transcode_to_hls(file_path, out_dir, segment_seconds=1200):
    """Transcode a video to HLS into out_dir. Returns the playlist path."""
    file_path = os.fspath(file_path)
    if not os.path.isfile(file_path):
        raise FileNotFoundError(file_path)

    os.makedirs(out_dir, exist_ok=True)
    playlist_path = os.path.join(out_dir, "index.m3u8")
    segment_pattern = os.path.join(out_dir, "segment_%03d.ts")

    subprocess.run(
        [
            "ffmpeg", "-y", "-nostdin", "-stats_period", "1", "-i", file_path,
            "-map", "0:v:0", "-map", "0:a:0?",
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-pix_fmt", "yuv420p", "-profile:v", "main",
            "-sc_threshold", "0",
            "-force_key_frames", f"expr:gte(t,n_forced*{segment_seconds})",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            "-hls_time", str(segment_seconds),
            "-hls_playlist_type", "vod",
            "-hls_flags", "independent_segments",
            "-hls_segment_filename", segment_pattern,
            playlist_path,
        ],
        check=True,
    )
    return playlist_path


def play_hls(playlist_path):
    """Play an HLS playlist with ffplay."""
    subprocess.run(["ffplay", "-autoexit", os.fspath(playlist_path)], check=True)


if __name__ == "__main__":
    playlist_path = transcode_to_hls(
        r"D:\MOVIES\[MF] Premalu (2024) Malayalam 1080p #HEVC HDRip x265 (DD+5.1.mkv",
        r"D:\MOVIES\hls_test",
    )
    print(playlist_path)
    play_hls(playlist_path)
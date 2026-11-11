#!/usr/bin/env bash
set -e
pip install -r requirements.txt

if ! command -v ffmpeg >/dev/null 2>&1; then
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "ffmpeg is required to process video uploads but cannot be installed: apt-get is unavailable." >&2
    exit 1
  fi
  apt-get update
  apt-get install -y ffmpeg
fi

mkdir -p bin
curl -fsSL https://downloads.rclone.org/rclone-current-linux-amd64.zip -o rclone.zip
python -m zipfile -e rclone.zip .
cp rclone-*-linux-amd64/rclone bin/rclone
chmod +x bin/rclone
rm -rf rclone.zip rclone-*-linux-amd64
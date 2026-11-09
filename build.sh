#!/usr/bin/env bash
set -e
pip install -r requirements.txt

mkdir -p bin
curl -fsSL https://downloads.rclone.org/rclone-current-linux-amd64.zip -o rclone.zip
python -m zipfile -e rclone.zip .
cp rclone-*-linux-amd64/rclone bin/rclone
chmod +x bin/rclone
rm -rf rclone.zip rclone-*-linux-amd64
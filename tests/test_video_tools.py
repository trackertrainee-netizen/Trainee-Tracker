import os
import unittest
from unittest.mock import patch

from CLOUD_FLARE.modules import PROJECT_ROOT, _tool_path


class VideoToolTests(unittest.TestCase):
    def test_prefers_bundled_tool_over_path(self):
        executable = "rclone.exe" if os.name == "nt" else "rclone"
        bundled = os.path.join(PROJECT_ROOT, "bin", executable)
        with patch("CLOUD_FLARE.modules.os.path.isfile", return_value=True), patch(
            "CLOUD_FLARE.modules.shutil.which", return_value="system-rclone"
        ):
            self.assertEqual(_tool_path("rclone"), bundled)

    def test_uses_path_when_tool_is_not_bundled(self):
        with patch("CLOUD_FLARE.modules.os.path.isfile", return_value=False), patch(
            "CLOUD_FLARE.modules.shutil.which", return_value="system-rclone"
        ):
            self.assertEqual(_tool_path("rclone"), "system-rclone")

    def test_finds_winget_rclone_when_not_on_path(self):
        executable = r"C:\Users\test\AppData\Local\Microsoft\WinGet\Packages\Rclone.Rclone_x\rclone-v1.0-windows-amd64\rclone.exe"
        with patch("CLOUD_FLARE.modules.os.name", "nt"), patch(
            "CLOUD_FLARE.modules.os.path.isfile", return_value=False
        ), patch("CLOUD_FLARE.modules.shutil.which", return_value=None), patch(
            "CLOUD_FLARE.modules.os.getenv", return_value=r"C:\Users\test\AppData\Local"
        ), patch("CLOUD_FLARE.modules.glob.glob", return_value=[executable]), patch(
            "CLOUD_FLARE.modules.os.path.getmtime", return_value=1
        ):
            self.assertEqual(_tool_path("rclone"), executable)


if __name__ == "__main__":
    unittest.main()

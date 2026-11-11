import unittest
from unittest.mock import patch

from CLOUD_FLARE import modules


class Paginator:
    def paginate(self, **_kwargs):
        return [
            {
                "CommonPrefixes": [
                    {"Prefix": "ADMINISTRATION/"},
                    {"Prefix": "HRMS/"},
                    {"Prefix": "MARKETING/"},
                    {"Prefix": "presentations/"},
                    {"Prefix": "/"},
                ]
            }
        ]


class S3Client:
    def get_paginator(self, operation):
        if operation != "list_objects_v2":
            raise AssertionError(f"Unexpected operation: {operation}")
        return Paginator()


class VideoFolderTests(unittest.TestCase):
    def test_lists_parent_folders_and_excludes_presentations(self):
        with patch.object(modules, "_get_s3_client", return_value=S3Client()):
            folders = modules.get_parent_folders()

        self.assertEqual(folders, ["ADMINISTRATION", "HRMS", "MARKETING"])


if __name__ == "__main__":
    unittest.main()

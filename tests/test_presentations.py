import io
import unittest

import app as server
from flask import g
from storage3.exceptions import StorageApiError


TRAINEE_ID = "11111111-1111-4111-8111-111111111111"


class Result:
    def __init__(self, data):
        self.data = data


class TraineeQuery:
    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return Result({"id": TRAINEE_ID, "name": "Jane Doe"})


class StorageBucket:
    def __init__(self):
        self.uploaded = None
        self.downloaded = None
        self.download_error = None

    def upload(self, key, data, file_options):
        self.uploaded = (key, data, file_options)

    def download(self, key):
        self.downloaded = key
        if self.download_error:
            raise self.download_error
        return b"%PDF-1.7\npresentation"


class Storage:
    def __init__(self):
        self.bucket_name = None
        self.bucket = StorageBucket()

    def from_(self, bucket_name):
        self.bucket_name = bucket_name
        return self.bucket


class DatabaseClient:
    def __init__(self):
        self.storage = Storage()

    def table(self, _table):
        return TraineeQuery()


class Database:
    def __init__(self):
        self.client = DatabaseClient()


class PresentationTests(unittest.TestCase):
    def setUp(self):
        self.database = Database()

    def test_upload_stores_pdf_under_trainee_name_folder(self):
        with server.app.test_request_context(
            "/api/presentations",
            method="POST",
            data={
                "trainee_id": TRAINEE_ID,
                "step": "7",
                "file": (io.BytesIO(b"%PDF-1.7\npresentation"), "work.pdf"),
            },
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = self.database

            response = server.upload_presentation()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"ok": True, "size": 21})
        self.assertEqual(self.database.client.storage.bucket_name, "presentations")
        self.assertEqual(
            self.database.client.storage.bucket.uploaded,
            (
                f"Jane Doe/{TRAINEE_ID}/7.pdf",
                b"%PDF-1.7\npresentation",
                {"content-type": "application/pdf", "upsert": "true"},
            ),
        )

    def test_download_uses_same_trainee_folder_and_bucket(self):
        with server.app.test_request_context(
            f"/api/presentations/{TRAINEE_ID}/7", method="GET"
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = self.database

            response = server.view_presentation(TRAINEE_ID, 7)

        self.assertEqual(self.database.client.storage.bucket_name, "presentations")
        self.assertEqual(
            self.database.client.storage.bucket.downloaded,
            f"Jane Doe/{TRAINEE_ID}/7.pdf",
        )
        self.assertEqual(response.mimetype, "application/pdf")
        self.assertEqual(response.get_data(), b"%PDF-1.7\npresentation")

    def test_missing_pdf_returns_not_found(self):
        self.database.client.storage.bucket.download_error = StorageApiError(
            "Object not found", "NotFound", 404
        )
        with server.app.test_request_context(
            f"/api/presentations/{TRAINEE_ID}/7", method="GET"
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = self.database

            response, status = server.view_presentation(TRAINEE_ID, 7)

        self.assertEqual(status, 404)
        self.assertEqual(response.get_json(), {"error": "Presentation not found."})


if __name__ == "__main__":
    unittest.main()

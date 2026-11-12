import io
import unittest
from unittest.mock import patch

import app as server
from flask import g


PDF = b"%PDF-1.7\nhierarchy"


class HierarchyFileTests(unittest.TestCase):
    def test_upload_still_accepts_images(self):
        image = b"\x89PNG\r\n\x1a\nimage"
        with server.app.test_request_context(
            "/api/hierarchy-images",
            method="POST",
            data={
                "business": "Magnus",
                "file": (io.BytesIO(image), "hierarchy.png"),
            },
        ):
            g.profile = {"role": "developer"}
            with patch.object(server, "upload_hierarchy_image") as store_file, patch.object(
                server, "read_hierarchy", return_value={}
            ), patch.object(server, "write_hierarchy"):
                response = server.upload_hierarchy()

        self.assertEqual(response.status_code, 200)
        store_file.assert_called_once_with("magnus", image, "image/png")

    def test_upload_accepts_pdf_and_stores_its_content_type(self):
        with server.app.test_request_context(
            "/api/hierarchy-images",
            method="POST",
            data={
                "business": "Magnus",
                "file": (io.BytesIO(PDF), "hierarchy.pdf"),
            },
        ):
            g.profile = {"role": "developer"}
            with patch.object(server, "upload_hierarchy_image") as store_file, patch.object(
                server, "read_hierarchy", return_value={}
            ), patch.object(server, "write_hierarchy"):
                response = server.upload_hierarchy()

        self.assertEqual(response.status_code, 200)
        store_file.assert_called_once_with("magnus", PDF, "application/pdf")
        self.assertEqual(response.get_json()["Magnus"]["type"], "application/pdf")

    def test_upload_rejects_non_image_and_non_pdf_files(self):
        with server.app.test_request_context(
            "/api/hierarchy-images",
            method="POST",
            data={
                "business": "Magnus",
                "file": (io.BytesIO(b"not a supported file"), "hierarchy.txt"),
            },
        ):
            g.profile = {"role": "developer"}

            response, status = server.upload_hierarchy()

        self.assertEqual(status, 400)
        self.assertIn("PDF", response.get_json()["error"])

    def test_pdf_hierarchy_is_served_inline(self):
        with server.app.test_request_context("/api/hierarchy-images/Magnus"):
            g.profile = {"role": "developer"}
            with patch.object(
                server,
                "get_hierarchy_object",
                return_value={
                    "Body": io.BytesIO(PDF),
                    "ContentLength": len(PDF),
                    "ContentType": "application/pdf",
                },
            ):
                response = server.view_hierarchy_image("Magnus")

        self.assertEqual(response.mimetype, "application/pdf")
        self.assertEqual(response.headers["Content-Disposition"], 'inline; filename="hierarchy.pdf"')
        self.assertEqual(response.get_data(), PDF)


if __name__ == "__main__":
    unittest.main()

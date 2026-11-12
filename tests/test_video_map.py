import unittest

import app as server
from flask import g
from postgrest.exceptions import APIError


MAGNUS_ID = "11111111-1111-4111-8111-111111111111"
ALIMS_ID = "22222222-2222-4222-8222-222222222222"


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.operation = "select"
        self.filters = {}
        self.payload = None

    def select(self, _columns):
        return self

    def upsert(self, payload, on_conflict):
        self.operation = "upsert"
        self.payload = payload
        self.on_conflict = on_conflict
        return self

    def delete(self):
        self.operation = "delete"
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def execute(self):
        if self.table == "video_task_mappings" and self.client.error:
            raise self.client.error
        if self.table == "businesses":
            return Result(self.client.businesses)
        if self.operation == "select":
            return Result(list(self.client.mappings))
        if self.operation == "upsert":
            self.client.mappings = [
                row for row in self.client.mappings
                if (row["business_id"], row["task_key"])
                != (self.payload["business_id"], self.payload["task_key"])
            ]
            self.client.mappings.append(self.payload)
            return Result([self.payload])
        if self.operation == "delete":
            self.client.mappings = [
                row for row in self.client.mappings
                if any(row[key] != value for key, value in self.filters.items())
            ]
            return Result([])
        raise AssertionError(f"Unexpected operation: {self.operation}")


class Client:
    def __init__(self, mappings=None, error=None):
        self.businesses = [
            {"id": MAGNUS_ID, "name": "Magnus"},
            {"id": ALIMS_ID, "name": "Alims"},
        ]
        self.mappings = list(mappings or [])
        self.error = error

    def table(self, name):
        return Query(self, name)


class Database:
    def __init__(self, client):
        self.client = client

    def list_video_task_mappings(self):
        if self.client.error:
            raise self.client.error
        return list(self.client.mappings)

    def save_video_task_mapping(self, business_id, task_key, folder):
        if self.client.error:
            raise self.client.error
        self.client.mappings = [
            row for row in self.client.mappings
            if (row["business_id"], row["task_key"]) != (business_id, task_key)
        ]
        if folder:
            self.client.mappings.append({
                "business_id": business_id,
                "task_key": task_key,
                "video_folder": folder,
            })


class VideoMapTests(unittest.TestCase):
    def setUp(self):
        self.client = Client()
        self.database = Database(self.client)

    def test_get_returns_business_name_keyed_mappings_in_current_scope(self):
        self.client.businesses = [{"id": MAGNUS_ID, "name": "Magnus"}]
        self.client.mappings = [
            {
                "business_id": MAGNUS_ID,
                "task_key": "1|Branding",
                "video_folder": "MARKETING/BRANDING",
            },
            {
                "business_id": ALIMS_ID,
                "task_key": "1|Branding",
                "video_folder": "ALIMS/BRANDING",
            },
        ]
        with server.app.test_request_context("/api/video-map"):
            g.profile = {"role": "business_view"}
            g.database = self.database
            response = server.get_video_map()

        self.assertEqual(
            response.get_json(),
            {"Magnus": {"1|Branding": "MARKETING/BRANDING"}},
        )

    def test_put_saves_mapping_by_business_id_and_returns_existing_api_shape(self):
        with server.app.test_request_context(
            "/api/video-map",
            method="PUT",
            json={
                "business": "Magnus",
                "key": "1|Branding",
                "folder": "MARKETING/BRANDING",
            },
        ):
            g.profile = {"role": "developer"}
            g.database = self.database
            response = server.put_video_map()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.mappings,
            [{
                "business_id": MAGNUS_ID,
                "task_key": "1|Branding",
                "video_folder": "MARKETING/BRANDING",
            }],
        )
        self.assertEqual(
            response.get_json(),
            {"Magnus": {"1|Branding": "MARKETING/BRANDING"}},
        )

    def test_put_with_empty_folder_removes_mapping(self):
        self.client.mappings = [{
            "business_id": MAGNUS_ID,
            "task_key": "1|Branding",
            "video_folder": "MARKETING/BRANDING",
        }]
        with server.app.test_request_context(
            "/api/video-map",
            method="PUT",
            json={"business": "Magnus", "key": "1|Branding", "folder": None},
        ):
            g.profile = {"role": "developer"}
            g.database = self.database
            response = server.put_video_map()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.mappings, [])
        self.assertEqual(response.get_json(), {})

    def test_missing_supabase_table_returns_actionable_error(self):
        self.client.error = APIError({
            "code": "PGRST205",
            "message": "Could not find the table 'public.video_task_mappings' in the schema cache",
        })
        with server.app.test_request_context("/api/video-map"):
            g.profile = {"role": "developer"}
            g.database = self.database
            response, status = server.get_video_map()

        self.assertEqual(status, 503)
        self.assertIn("Apply DATA_BASE/workflow.sql", response.get_json()["error"])

    def test_missing_service_role_key_returns_actionable_error(self):
        self.client.error = RuntimeError(
            "Set SUPABASE_SERVICE_ROLE_KEY in the server environment."
        )
        with server.app.test_request_context("/api/video-map"):
            g.profile = {"role": "developer"}
            g.database = self.database
            get_response, get_status = server.get_video_map()
        with server.app.test_request_context(
            "/api/video-map",
            method="PUT",
            json={
                "business": "Magnus",
                "key": "1|Branding",
                "folder": "MARKETING/BRANDING",
            },
        ):
            g.profile = {"role": "developer"}
            g.database = self.database
            put_response, put_status = server.put_video_map()

        self.assertEqual(get_status, 503)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", get_response.get_json()["error"])
        self.assertEqual(put_status, 503)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY", put_response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()

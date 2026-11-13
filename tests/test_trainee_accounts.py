import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app as server
from DATA_BASE.db import DataBase, trainee_auth_email
from flask import g
from storage3.exceptions import StorageApiError


TRAINEE_ID = "11111111-1111-4111-8111-111111111111"
AUTH_USER_ID = "22222222-2222-4222-8222-222222222222"


class Result:
    data = []


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.operation = None
        self.payload = None

    def select(self, columns):
        self.operation = "select"
        self.columns = columns
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
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
        self.filter = (column, value)
        return self

    def maybe_single(self):
        return self

    def limit(self, count):
        self.limit_count = count
        return self

    def execute(self):
        self.client.operations.append((self.table, self.operation, self.payload))
        if self.operation == "select":
            data = self.client.select_data.get(
                self.table,
                {"id": TRAINEE_ID, "name": "Jane Doe"} if self.table == "trainees" else [],
            )
            return SimpleNamespace(data=data)
        if self.operation == "delete" and hasattr(self.client, self.table):
            column, value = self.filter
            records = getattr(self.client, self.table)
            records[:] = [row for row in records if row.get(column) != value]
        return Result()


class Client:
    def __init__(self):
        self.operations = []
        self.profiles = []
        self.auth = SimpleNamespace(
            admin=SimpleNamespace(
                create_user=self.create_user,
                delete_user=self.delete_user,
                update_user_by_id=self.update_user_by_id,
            )
        )
        self.created_user_attributes = None
        self.deleted_user_id = None
        self.updated_user = None
        self.select_data = {}

    def table(self, name):
        return Query(self, name)

    def create_user(self, attributes):
        self.created_user_attributes = attributes
        return SimpleNamespace(user=SimpleNamespace(id=AUTH_USER_ID))

    def delete_user(self, user_id):
        self.deleted_user_id = user_id

    def update_user_by_id(self, user_id, attributes):
        self.updated_user = (user_id, attributes)


class TraineeAccountTests(unittest.TestCase):
    def test_name_is_normalized_for_login_username(self):
        self.assertEqual(
            trainee_auth_email("Jane Doe"),
            trainee_auth_email("  jane   doe "),
        )

    def test_account_creation_links_auth_user_to_trainee_profile(self):
        app_client = Client()
        admin_client = Client()
        with patch("DATA_BASE.db.create_client", return_value=app_client):
            database = DataBase("https://example.supabase.co", "test-key")

        database._create_trainee_account(
            admin_client,
            TRAINEE_ID,
            {"id": TRAINEE_ID, "name": "Jane Doe", "designation_id": "designation-id"},
            "safe-password",
        )

        self.assertEqual(
            admin_client.created_user_attributes,
            {
                "email": trainee_auth_email("Jane Doe"),
                "password": "safe-password",
                "email_confirm": True,
                "user_metadata": {"username": "Jane Doe", "full_name": "Jane Doe"},
            },
        )
        self.assertEqual(
            admin_client.operations,
            [
                (
                    "profiles",
                    "upsert",
                    {
                        "id": AUTH_USER_ID,
                        "full_name": "Jane Doe",
                        "role": "trainee",
                        "trainee_id": TRAINEE_ID,
                    },
                )
            ],
        )
        self.assertEqual(app_client.operations[0][0:2], ("trainees", "insert"))

    def test_existing_trainee_can_be_given_a_login_without_recreating_record(self):
        database_client = Client()
        admin_client = Client()
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")
        with patch.dict("os.environ", {"SUPABASE_SERVICE_ROLE_KEY": "service-test"}), patch(
            "DATA_BASE.db.create_client", return_value=admin_client
        ):
            username = database.set_trainee_login(TRAINEE_ID, "safe-password")

        self.assertEqual(username, "Jane Doe")
        self.assertEqual(
            admin_client.created_user_attributes,
            {
                "email": trainee_auth_email("Jane Doe"),
                "password": "safe-password",
                "email_confirm": True,
                "user_metadata": {"username": "Jane Doe", "full_name": "Jane Doe"},
            },
        )
        self.assertIn(
            (
                "profiles",
                "upsert",
                {
                    "id": AUTH_USER_ID,
                    "full_name": "Jane Doe",
                    "role": "trainee",
                    "trainee_id": TRAINEE_ID,
                },
            ),
            admin_client.operations,
        )
        self.assertFalse(any(operation[:2] == ("trainees", "insert") for operation in admin_client.operations))

    def test_existing_linked_account_gets_password_updated(self):
        database_client = Client()
        admin_client = Client()
        admin_client.select_data["profiles"] = [{"id": AUTH_USER_ID}]
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")
        with patch.dict("os.environ", {"SUPABASE_SERVICE_ROLE_KEY": "service-test"}), patch(
            "DATA_BASE.db.create_client", return_value=admin_client
        ):
            database.set_trainee_login(TRAINEE_ID, "new-password")

        self.assertEqual(
            admin_client.updated_user,
            (
                AUTH_USER_ID,
                {
                    "email": trainee_auth_email("Jane Doe"),
                    "password": "new-password",
                    "email_confirm": True,
                    "user_metadata": {"username": "Jane Doe", "full_name": "Jane Doe"},
                },
            ),
        )
        self.assertIn(
            ("profiles", "update", {"full_name": "Jane Doe"}),
            admin_client.operations,
        )
        self.assertIsNone(admin_client.created_user_attributes)

    def test_trainee_progress_save_updates_existing_rows_without_upsert(self):
        database_client = Client()
        database_client.select_data["trainee_workflow"] = [{"id": TRAINEE_ID}]
        database_client.select_data["trainee_progress"] = [
            {"trainee_id": TRAINEE_ID, "step_index": 0}
        ]
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")

        database.save_trainees(
            [
                {
                    "id": TRAINEE_ID,
                    "logs": [
                        {
                            "s": 0,
                            "a": "changed-assignment",
                            "st": "2026-11-11T10:01:00Z",
                            "c": "2026-11-11T10:02:00Z",
                            "v": "HR",
                            "vt": "changed-verification",
                        },
                        {"s": 1, "a": "2026-11-11T10:02:00Z"},
                    ],
                }
            ],
            {"role": "trainee", "trainee_id": TRAINEE_ID},
        )

        progress_operations = [
            operation for operation in database_client.operations
            if operation[0] == "trainee_progress" and operation[1] != "select"
        ]
        self.assertEqual([operation[1] for operation in progress_operations], ["update", "insert"])
        self.assertEqual(
            progress_operations[0][2],
            {
                "trainee_id": TRAINEE_ID,
                "step_index": 0,
                "started_at": "2026-11-11T10:01:00Z",
                "completed_at": "2026-11-11T10:02:00Z",
                "presentation": None,
            },
        )
        self.assertEqual(
            progress_operations[1][2],
            {
                "trainee_id": TRAINEE_ID,
                "step_index": 1,
                "started_at": None,
                "completed_at": None,
                "presentation": None,
            },
        )

    def test_removing_trainee_deletes_presentations_before_record(self):
        database_client = Client()
        database_client.select_data["trainee_workflow"] = [
            {"id": TRAINEE_ID, "name": "Jane Doe"}
        ]
        admin_client = Client()
        admin_client.select_data["profiles"] = [{"id": AUTH_USER_ID}]
        admin_client.profiles = [{"id": AUTH_USER_ID}]
        bucket = SimpleNamespace(
            list=Mock(return_value=[{"name": "7.pdf"}, {"name": "8.pdf"}]),
            remove=Mock(),
        )
        admin_client.storage = SimpleNamespace(from_=Mock(return_value=bucket))
        bucket.remove.side_effect = lambda _paths: self.assertFalse(
            any(operation[:2] == ("trainees", "delete") for operation in database_client.operations)
        )
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")

        with patch.object(database, "_auth_admin_client", return_value=admin_client):
            database.save_trainees([], {"role": "developer"})

        prefix = f"Jane Doe/{TRAINEE_ID}"
        bucket.list.assert_called_once_with(prefix, {"limit": 1000})
        bucket.remove.assert_called_once_with(
            [f"{prefix}/7.pdf", f"{prefix}/8.pdf"]
        )
        self.assertIn(
            ("trainees", "delete", None),
            database_client.operations,
        )
        self.assertEqual(admin_client.deleted_user_id, AUTH_USER_ID)
        self.assertIn(
            ("profiles", "delete", None),
            admin_client.operations,
        )
        self.assertEqual(admin_client.profiles, [])

    def test_storage_failure_prevents_trainee_deletion(self):
        database_client = Client()
        database_client.select_data["trainee_workflow"] = [
            {"id": TRAINEE_ID, "name": "Jane Doe"}
        ]
        bucket = SimpleNamespace(
            list=Mock(side_effect=RuntimeError("storage unavailable")),
            remove=Mock(),
        )
        admin_client = SimpleNamespace(
            storage=SimpleNamespace(from_=Mock(return_value=bucket))
        )
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")

        with patch.object(database, "_auth_admin_client", return_value=admin_client):
            with self.assertRaisesRegex(RuntimeError, "storage unavailable"):
                database.save_trainees([], {"role": "developer"})

        self.assertFalse(
            any(operation[:2] == ("trainees", "delete") for operation in database_client.operations)
        )

    def test_video_mappings_use_the_privileged_supabase_client(self):
        database_client = Client()
        admin_client = Client()
        existing_mapping = {
            "business_id": "business-id",
            "task_key": "1|Branding",
            "video_folder": "MARKETING/BRANDING",
        }
        admin_client.select_data["video_task_mappings"] = [existing_mapping]
        with patch("DATA_BASE.db.create_client", return_value=database_client):
            database = DataBase("https://example.supabase.co", "test-key")

        with patch.object(database, "_auth_admin_client", return_value=admin_client):
            self.assertEqual(database.list_video_task_mappings(), [existing_mapping])
            database.save_video_task_mapping(
                "business-id", "1|Branding", "MARKETING/BRANDING"
            )
            database.save_video_task_mapping("business-id", "1|Branding", None)

        self.assertIn(
            (
                "video_task_mappings",
                "upsert",
                existing_mapping,
            ),
            admin_client.operations,
        )
        self.assertIn(
            ("video_task_mappings", "delete", None),
            admin_client.operations,
        )

    def test_presentation_cleanup_failure_is_reported_by_api(self):
        class FailingDatabase:
            def save_trainees(self, _rows, _profile):
                raise StorageApiError("Storage unavailable", "InternalError", 500)

        with server.app.test_request_context(
            "/api/trainees", method="PUT", json=[]
        ):
            g.database = FailingDatabase()
            g.profile = {"role": "developer"}
            response, status = server.put_trainees()

        self.assertEqual(status, 502)
        self.assertIn("The trainee was not deleted", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()

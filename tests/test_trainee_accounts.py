import unittest
from types import SimpleNamespace
from unittest.mock import patch

from DATA_BASE.db import DataBase, trainee_auth_email


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
        return Result()


class Client:
    def __init__(self):
        self.operations = []
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


if __name__ == "__main__":
    unittest.main()

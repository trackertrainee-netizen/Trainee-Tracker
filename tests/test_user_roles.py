import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import app as server
from flask import g
from postgrest.exceptions import APIError


USER_ID = "33333333-3333-4333-8333-333333333333"
BUSINESS_ID = "44444444-4444-4444-8444-444444444444"


class AdminProfileQuery:
    def __init__(self, client):
        self.client = client

    def upsert(self, profile):
        self.client.profile = profile
        return self

    def execute(self):
        if self.client.profile_error:
            raise self.client.profile_error
        return SimpleNamespace(data=[self.client.profile])


class AdminClient:
    def __init__(self, profile_error=None):
        self.profile = None
        self.profile_error = profile_error
        self.auth = SimpleNamespace(
            admin=SimpleNamespace(
                create_user=lambda _payload: SimpleNamespace(
                    user=SimpleNamespace(id=USER_ID)
                ),
                delete_user=lambda _user_id: None,
            )
        )

    def table(self, _table):
        return AdminProfileQuery(self)


class BusinessQuery:
    def select(self, _columns):
        return self

    def eq(self, _column, _value):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return SimpleNamespace(data={"id": BUSINESS_ID, "name": "Example"})


class UserRoleTests(unittest.TestCase):
    def create_user(self, profile, business_id, profile_error=None):
        admin = AdminClient(profile_error)
        database = SimpleNamespace(
            client=SimpleNamespace(table=lambda _table: BusinessQuery())
        )
        body = {
            "username": "hr-user",
            "password": "valid-password",
            "role": "business_hr",
            "business_id": business_id,
        }
        with patch.dict(os.environ, {"SUPABASE_SERVICE_ROLE_KEY": "test-key"}):
            with patch.object(server, "create_client", return_value=admin):
                with server.app.test_request_context("/api/users", method="POST", json=body):
                    g.profile = profile
                    g.database = database
                    response, status = server.create_user_account()
        return response, status, admin.profile

    def test_developer_can_create_all_business_hr(self):
        response, status, profile = self.create_user(
            {"role": "developer"}, "all"
        )

        self.assertEqual(status, 201)
        self.assertEqual(response.get_json()["role"], "business_hr")
        self.assertIsNone(profile["business_id"])

    def test_business_creator_cannot_assign_global_hr_scope(self):
        response, status, profile = self.create_user(
            {"role": "business", "business_id": BUSINESS_ID}, "all"
        )

        self.assertEqual(status, 201)
        self.assertEqual(profile["business_id"], BUSINESS_ID)

    def test_scoped_hr_user_creation_stays_in_its_business(self):
        response, status, profile = self.create_user(
            {"role": "business_hr", "business_id": BUSINESS_ID}, "all"
        )

        self.assertEqual(status, 201)
        self.assertEqual(profile["business_id"], BUSINESS_ID)

    def test_hr_receives_business_salary_fields(self):
        database = SimpleNamespace(
            list_trainees=lambda: [{"id": USER_ID, "sal": 5000, "wage": 250}]
        )
        with server.app.test_request_context("/api/trainees"):
            g.profile = {"role": "business_hr"}
            g.database = database
            response = server.get_trainees()

        self.assertEqual(response.get_json()[0]["sal"], 5000)
        self.assertEqual(response.get_json()[0]["wage"], 250)

    def test_role_constraint_error_explains_required_migration(self):
        error = APIError({
            "code": "23514",
            "message": 'new row violates check constraint "profiles_role_check"',
        })
        response, status, _profile = self.create_user(
            {"role": "developer"}, "all", profile_error=error
        )

        self.assertEqual(status, 503)
        self.assertIn("Apply the updated DATA_BASE/workflow.sql", response.get_json()["error"])


if __name__ == "__main__":
    unittest.main()

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app as server
from flask import g


BUSINESS_ID = "11111111-1111-4111-8111-111111111111"
VIEWER_ID = "22222222-2222-4222-8222-222222222222"
OTHER_VIEWER_ID = "33333333-3333-4333-8333-333333333333"
BUSINESS_USER_ID = "44444444-4444-4444-8444-444444444444"
OTHER_BUSINESS_ID = "55555555-5555-4555-8555-555555555555"
NEW_USER_ID = "77777777-7777-4777-8777-777777777777"
BRANCH_ID = "88888888-8888-4888-8888-888888888888"
OTHER_BRANCH_ID = "99999999-9999-4999-8999-999999999999"


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.operation = "select"
        self.filters = {}
        self.payload = None
        self.single = False

    def select(self, _columns):
        self.operation = "select"
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def upsert(self, payload, on_conflict=None):
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

    def maybe_single(self):
        self.single = True
        return self

    def execute(self):
        records = getattr(self.client, self.table_name)
        if self.operation == "select":
            found = [
                row for row in records
                if all(row.get(key) == value for key, value in self.filters.items())
            ]
            return Result((found[0] if found else None) if self.single else found)
        if self.operation == "update":
            for row in records:
                if all(row.get(key) == value for key, value in self.filters.items()):
                    row.update(self.payload)
            return Result([])
        if self.operation == "upsert":
            records.append(self.payload)
            return Result([self.payload])
        if self.operation == "delete":
            records[:] = [
                row for row in records
                if any(row.get(key) != value for key, value in self.filters.items())
            ]
            return Result([])
        raise AssertionError(f"Unexpected operation: {self.operation}")


class AdminClient:
    def __init__(self):
        self.businesses = [
            {"id": BUSINESS_ID, "name": "Magnus"},
            {"id": OTHER_BUSINESS_ID, "name": "Alims"},
        ]
        self.profiles = [
            {
                "id": VIEWER_ID,
                "full_name": "Mia",
                "role": "business_view",
                "business_id": BUSINESS_ID,
                "trainee_id": None,
            },
            {
                "id": OTHER_VIEWER_ID,
                "full_name": "Nia",
                "role": "business_view",
                "business_id": BUSINESS_ID,
                "trainee_id": None,
            },
            {
                "id": BUSINESS_USER_ID,
                "full_name": "Ben",
                "role": "business",
                "business_id": BUSINESS_ID,
                "trainee_id": None,
            },
            {
                "id": "66666666-6666-4666-8666-666666666666",
                "full_name": "Other business viewer",
                "role": "business_view",
                "business_id": OTHER_BUSINESS_ID,
                "trainee_id": None,
            },
        ]
        self.auth = SimpleNamespace(admin=SimpleNamespace(
            create_user=Mock(return_value=SimpleNamespace(
                user=SimpleNamespace(id=NEW_USER_ID),
            )),
            get_user_by_id=Mock(return_value=SimpleNamespace(
                user=SimpleNamespace(user_metadata={"username": "Zara"}),
            )),
            update_user_by_id=Mock(),
            delete_user=Mock(),
        ))

    def table(self, name):
        return Query(self, name)


class UserManagementTests(unittest.TestCase):
    def setUp(self):
        self.admin = AdminClient()
        self.manager = {
            "id": VIEWER_ID,
            "role": "business_view",
            "business_id": BUSINESS_ID,
        }

    def request(self, path, method="GET", json=None):
        context = server.app.test_request_context(path, method=method, json=json)
        context.push()
        g.profile = self.manager
        g.database = SimpleNamespace(url="https://example.supabase.co")
        return context

    def test_business_viewer_lists_only_viewer_accounts_in_own_business(self):
        context = self.request("/api/users")
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response = server.get_user_accounts()
        finally:
            context.pop()

        self.assertEqual(
            response.get_json(),
            [{
                "id": VIEWER_ID,
                "username": "Mia",
                "role": "business_view",
                "business_id": BUSINESS_ID,
                "business": "Magnus",
            }, {
                "id": OTHER_VIEWER_ID,
                "username": "Nia",
                "role": "business_view",
                "business_id": BUSINESS_ID,
                "business": "Magnus",
            }],
        )

    def test_user_listing_uses_auth_username_when_profile_name_is_missing(self):
        self.admin.profiles.append({
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "full_name": None,
            "role": "business_view",
            "business_id": BUSINESS_ID,
            "trainee_id": None,
        })
        context = self.request("/api/users")
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response = server.get_user_accounts()
        finally:
            context.pop()

        self.assertIn("Zara", [user["username"] for user in response.get_json()])

    def test_business_viewer_cannot_create_business_role(self):
        context = self.request(
            "/api/users",
            method="POST",
            json={
                "username": "Noah",
                "password": "safe-password",
                "role": "business",
            },
        )
        try:
            response, status = server.create_user_account()
        finally:
            context.pop()

        self.assertEqual(status, 403)
        self.assertIn("cannot create that role", response.get_json()["error"])

    def test_business_viewer_can_create_viewer_in_own_business(self):
        context = self.request(
            "/api/users",
            method="POST",
            json={
                "username": "Noah",
                "password": "safe-password",
                "role": "business_view",
                "business_id": OTHER_BUSINESS_ID,
            },
        )
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response, status = server.create_user_account()
        finally:
            context.pop()

        self.assertEqual(status, 201)
        created = next(row for row in self.admin.profiles if row["id"] == NEW_USER_ID)
        self.assertEqual(created["business_id"], BUSINESS_ID)
        self.assertEqual(created["role"], "business_view")

    def test_business_viewer_can_update_user_in_scope(self):
        context = self.request(
            f"/api/users/{OTHER_VIEWER_ID}",
            method="PUT",
            json={
                "username": "Nia Updated",
                "password": "new-password",
                "role": "business_view",
            },
        )
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response = server.update_user_account(OTHER_VIEWER_ID)
        finally:
            context.pop()

        self.assertEqual(response.status_code, 200)
        updated = next(row for row in self.admin.profiles if row["id"] == OTHER_VIEWER_ID)
        self.assertEqual(updated["full_name"], "Nia Updated")
        self.admin.auth.admin.update_user_by_id.assert_called_once()

    def test_business_viewer_cannot_update_an_account_in_another_business(self):
        other_id = "66666666-6666-4666-8666-666666666666"
        context = self.request(
            f"/api/users/{other_id}",
            method="PUT",
            json={"username": "Other business viewer", "role": "business_view"},
        )
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response, status = server.update_user_account(other_id)
        finally:
            context.pop()

        self.assertEqual(status, 403)

    def test_legacy_branch_does_not_limit_user_management_within_business(self):
        manager_profile = dict(self.manager, branch_id=BRANCH_ID)
        target = next(row for row in self.admin.profiles if row["id"] == OTHER_VIEWER_ID)
        target["branch_id"] = OTHER_BRANCH_ID
        context = self.request(
            f"/api/users/{OTHER_VIEWER_ID}",
            method="PUT",
            json={"username": "Nia", "role": "business_view"},
        )
        g.profile = manager_profile
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response = server.update_user_account(OTHER_VIEWER_ID)
        finally:
            context.pop()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(target["branch_id"], OTHER_BRANCH_ID)

    def test_user_cannot_remove_their_own_account(self):
        context = self.request(f"/api/users/{VIEWER_ID}", method="DELETE")
        try:
            response, status = server.delete_user_account(VIEWER_ID)
        finally:
            context.pop()

        self.assertEqual(status, 400)
        self.admin.auth.admin.delete_user.assert_not_called()

    def test_business_viewer_can_remove_another_viewer_in_scope(self):
        context = self.request(f"/api/users/{OTHER_VIEWER_ID}", method="DELETE")
        try:
            with patch.object(server, "_service_admin_client", return_value=self.admin):
                response = server.delete_user_account(OTHER_VIEWER_ID)
        finally:
            context.pop()

        self.assertEqual(response.status_code, 200)
        self.assertNotIn(OTHER_VIEWER_ID, [row["id"] for row in self.admin.profiles])
        self.admin.auth.admin.delete_user.assert_called_once_with(OTHER_VIEWER_ID)

if __name__ == "__main__":
    unittest.main()

import unittest
from unittest.mock import patch

import app as server
from DATA_BASE.db import DataBase
from flask import g


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = {}
        self.operation = "select"
        self.payload = None
        self.single = False

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def limit(self, _count):
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.operation == "insert":
            self.client.insertions.append((self.table, self.payload))
            return Result([self.payload])
        if self.single:
            parent_id = self.filters.get("id")
            return Result({"id": parent_id} if parent_id in self.client.parents else None)
        if (self.table, tuple(sorted(self.filters.items()))) in self.client.duplicates:
            return Result([{"id": "existing"}])
        return Result([])


class Client:
    def __init__(self):
        self.insertions = []
        self.parents = {"11111111-1111-4111-8111-111111111111"}
        self.duplicates = set()

    def table(self, name):
        return Query(self, name)


class OrganizationDatabaseTests(unittest.TestCase):
    def make_database(self, client):
        with patch("DATA_BASE.db.create_client", return_value=client):
            return DataBase("https://example.supabase.co", "test-key")

    def test_creates_department_under_selected_branch(self):
        client = Client()
        database = self.make_database(client)
        parent_id = "11111111-1111-4111-8111-111111111111"

        result = database.create_organization_record("department", " HR ", parent_id)

        self.assertEqual(result, [{"name": "HR", "branch_id": parent_id}])
        self.assertEqual(client.insertions, [("departments", {"name": "HR", "branch_id": parent_id})])

    def test_rejects_missing_parent(self):
        client = Client()
        database = self.make_database(client)

        with self.assertRaisesRegex(ValueError, "existing parent"):
            database.create_organization_record(
                "branch", "Manjeri", "22222222-2222-4222-8222-222222222222"
            )

        self.assertEqual(client.insertions, [])

    def test_business_users_can_create_organization_records(self):
        class Database:
            def create_organization_record(self, entity, name, parent_id=None):
                self.entity = entity
                self.name = name
                self.parent_id = parent_id
                return [{"entity": entity, "name": name, "parent_id": parent_id}]

        with server.app.test_request_context(
            "/api/organization",
            method="POST",
            json={"entity": "business", "name": "New business"},
        ):
            g.profile = {"role": "business"}
            g.database = Database()

            response, status = server.create_organization_record()

        self.assertEqual(status, 201)
        self.assertEqual(response.get_json()["record"]["name"], "New business")


if __name__ == "__main__":
    unittest.main()

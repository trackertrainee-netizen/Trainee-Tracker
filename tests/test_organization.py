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
        rows = [
            row for row in self.client.rows.get(self.table, [])
            if all(row.get(key) == value for key, value in self.filters.items())
        ]
        if self.single:
            return Result(rows[0] if rows else None)
        if (self.table, tuple(sorted(self.filters.items()))) in self.client.duplicates:
            return Result([{"id": "existing"}])
        return Result(rows)


class Client:
    def __init__(self):
        self.insertions = []
        self.rows = {
            "businesses": [{"id": "11111111-1111-4111-8111-111111111111", "name": "Magnus"}],
            "branches": [{
                "id": "22222222-2222-4222-8222-222222222222",
                "business_id": "11111111-1111-4111-8111-111111111111",
            }],
            "departments": [],
            "designations": [],
        }
        self.duplicates = set()

    def table(self, name):
        return Query(self, name)


class OrganizationDatabaseTests(unittest.TestCase):
    def make_database(self, client):
        with patch("DATA_BASE.db.create_client", return_value=client):
            return DataBase("https://example.supabase.co", "test-key")

    def test_creates_department_under_business_using_existing_internal_branch(self):
        client = Client()
        database = self.make_database(client)
        business_id = "11111111-1111-4111-8111-111111111111"
        branch_id = "22222222-2222-4222-8222-222222222222"

        result = database.create_organization_record("department", " HR ", business_id)

        self.assertEqual(result, [{"name": "HR", "branch_id": branch_id}])
        self.assertEqual(client.insertions, [("departments", {"name": "HR", "branch_id": branch_id})])

    def test_rejects_missing_parent(self):
        client = Client()
        database = self.make_database(client)

        with self.assertRaisesRegex(ValueError, "existing parent"):
            database.create_organization_record(
                "department", "HR", "22222222-2222-4222-8222-222222222222"
            )

        self.assertEqual(client.insertions, [])

    def test_options_resolve_legacy_department_business_without_exposing_branches(self):
        client = Client()
        client.rows["departments"] = [{
            "id": "33333333-3333-4333-8333-333333333333",
            "branch_id": client.rows["branches"][0]["id"],
            "name": "HR",
        }]
        options = self.make_database(client).list_options()

        self.assertNotIn("branches", options)
        self.assertEqual(options["departments"], [{
            "id": "33333333-3333-4333-8333-333333333333",
            "business_id": "11111111-1111-4111-8111-111111111111",
            "name": "HR",
        }])

    def test_trainee_designation_resolves_across_legacy_branches(self):
        client = Client()
        second_branch_id = "44444444-4444-4444-8444-444444444444"
        department_id = "55555555-5555-4555-8555-555555555555"
        designation_id = "66666666-6666-4666-8666-666666666666"
        client.rows["branches"].append({
            "id": second_branch_id,
            "business_id": "11111111-1111-4111-8111-111111111111",
        })
        client.rows["departments"].extend([
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "branch_id": client.rows["branches"][0]["id"],
                "name": "HR",
            },
            {"id": department_id, "branch_id": second_branch_id, "name": "HR"},
        ])
        client.rows["designations"] = [{
            "id": designation_id,
            "department_id": department_id,
            "title": "Manager",
        }]

        result = self.make_database(client)._designation_id({
            "biz": "Magnus",
            "dept": "HR",
            "desg": "Manager",
        })

        self.assertEqual(result, designation_id)

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

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import app as server
from DATA_BASE.db import trainee_auth_email


class LoginAliasTests(unittest.TestCase):
    def test_developer_username_maps_to_internal_supabase_email(self):
        auth = SimpleNamespace(
            user=SimpleNamespace(id="user-id"),
            session=SimpleNamespace(
                access_token="access-token",
                refresh_token="refresh-token",
                expires_in=3600,
            ),
        )
        database = SimpleNamespace(
            sign_in=Mock(return_value=auth),
            profile=Mock(return_value={"role": "developer"}),
        )
        with patch.object(server, "_db", return_value=database), patch.object(
            server, "_profile_payload", return_value={"role": "developer"}
        ):
            response = server.app.test_client().post(
                "/api/login",
                json={"username": "developer", "password": "unit-test-password"},
            )

        self.assertEqual(response.status_code, 200)
        database.sign_in.assert_called_once_with(
            server.DEVELOPER_AUTH_EMAIL, "unit-test-password"
        )

    def test_trainee_name_is_mapped_to_its_auth_email(self):
        auth = SimpleNamespace(
            user=SimpleNamespace(id="trainee-user-id"),
            session=SimpleNamespace(
                access_token="access-token",
                refresh_token="refresh-token",
                expires_in=3600,
            ),
        )
        database = SimpleNamespace(
            sign_in=Mock(return_value=auth),
            profile=Mock(return_value={"role": "trainee"}),
        )
        with patch.object(server, "_db", return_value=database), patch.object(
            server, "_profile_payload", return_value={"role": "trainee"}
        ):
            response = server.app.test_client().post(
                "/api/login",
                json={"username": "Jane Doe", "password": "unit-test-password"},
            )

        self.assertEqual(response.status_code, 200)
        database.sign_in.assert_called_once_with(
            trainee_auth_email("Jane Doe"), "unit-test-password"
        )

    def test_trainee_username_ignores_case_and_repeated_spaces(self):
        self.assertEqual(
            trainee_auth_email("Jane Doe"),
            trainee_auth_email("  jane   doe "),
        )


if __name__ == "__main__":
    unittest.main()

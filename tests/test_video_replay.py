import unittest
from types import SimpleNamespace

import app as server
from flask import g
from postgrest.exceptions import APIError


TRAINEE_ID = "11111111-1111-4111-8111-111111111111"
REPLAY_ID = "22222222-2222-4222-8222-222222222222"
VIDEO_STEP = 8


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, client, table):
        self.client = client
        self.table_name = table
        self.filters = {}
        self.operation = "select"
        self.payload = None

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self.filters[column] = value
        return self

    def order(self, _column, desc=False):
        return self

    def maybe_single(self):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        return self

    def execute(self):
        if self.client.error:
            raise self.client.error
        if self.operation == "insert":
            self.client.insertions.append((self.table_name, self.payload))
            return Result([self.payload])
        if self.table_name == "training_steps":
            data = {"step_index": VIDEO_STEP, "step_type": "VIDEO"} if self.filters.get("step_index") == VIDEO_STEP else None
            return Result(data)
        if self.table_name == "video_watch_completions":
            data = {"trainee_id": TRAINEE_ID} if self.client.watched else None
            return Result(data)
        if self.table_name == "video_replay_requests":
            return Result([])
        raise AssertionError(f"Unexpected table: {self.table_name}")


class Client:
    def __init__(self, watched=False):
        self.watched = watched
        self.insertions = []
        self.error = None

    def table(self, name):
        return Query(self, name)


class VideoReplayTests(unittest.TestCase):
    def test_only_trainees_can_record_video_completion(self):
        with server.app.test_request_context(
            "/api/video-watch-completions", method="POST", json={"step_index": VIDEO_STEP}
        ):
            g.profile = {"role": "business"}
            response, status = server.record_video_watch_completion()

        self.assertEqual(status, 403)

    def test_replay_request_requires_completed_video(self):
        client = Client()
        with server.app.test_request_context(
            "/api/video-replay-requests", method="POST", json={"step_index": VIDEO_STEP}
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = SimpleNamespace(client=client)
            response, status = server.create_video_replay_request()

        self.assertEqual(status, 409)
        self.assertEqual(response.get_json()["error"], "Finish the video before requesting a replay.")
        self.assertEqual(client.insertions, [])

    def test_completed_trainee_video_creates_replay_request(self):
        client = Client(watched=True)
        with server.app.test_request_context(
            "/api/video-replay-requests", method="POST", json={"step_index": VIDEO_STEP}
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = SimpleNamespace(client=client)
            response, status = server.create_video_replay_request()

        self.assertEqual(status, 201)
        self.assertEqual(response.get_json(), {"ok": True, "status": "pending"})
        self.assertEqual(
            client.insertions,
            [("video_replay_requests", {"trainee_id": TRAINEE_ID, "step_index": VIDEO_STEP})],
        )

    def test_non_video_task_cannot_be_used_for_replay_request(self):
        client = Client(watched=True)
        with server.app.test_request_context(
            "/api/video-replay-requests", method="POST", json={"step_index": 7}
        ):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = SimpleNamespace(client=client)
            response, status = server.create_video_replay_request()

        self.assertEqual(status, 400)
        self.assertEqual(client.insertions, [])

    def test_missing_supabase_migration_returns_actionable_error(self):
        client = Client()
        client.error = APIError({
            "code": "PGRST205",
            "message": "Could not find the table 'public.video_watch_completions' in the schema cache",
        })
        with server.app.test_request_context("/api/video-watch-completions"):
            g.profile = {"role": "trainee", "trainee_id": TRAINEE_ID}
            g.database = SimpleNamespace(client=client)
            response, status = server.list_video_watch_completions()

        self.assertEqual(status, 503)
        self.assertIn("Apply DATA_BASE/workflow.sql", response.get_json()["error"])

    def test_only_hr_can_open_replay_inbox(self):
        with server.app.test_request_context("/api/video-replay-requests"):
            g.profile = {"role": "business"}
            response, status = server.list_video_replay_requests()

        self.assertEqual(status, 403)

        with server.app.test_request_context("/api/video-replay-requests"):
            g.profile = {"role": "business_hr"}
            g.database = SimpleNamespace(client=Client())
            response = server.list_video_replay_requests()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), [])

    def test_standard_business_cannot_review_replay_requests(self):
        with server.app.test_request_context(
            f"/api/video-replay-requests/{REPLAY_ID}",
            method="PUT",
            json={"status": "approved"},
        ):
            g.profile = {"role": "business"}
            response, status = server.review_video_replay_request(REPLAY_ID)

        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main()

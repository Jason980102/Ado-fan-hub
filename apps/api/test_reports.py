"""Isolated tests: temp SQLite only; never import main or start workers."""
import os
import tempfile
import unittest
import sqlite3
import io
from contextlib import redirect_stdout
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from reports_api import initialize, router
from reports_body_limit import ReportsBodyLimit


class ReportsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "reports.sqlite3"
        initialize(self.path)
        self.env = patch.dict(os.environ, {"ADO_REPORTS_ENABLED": "1", "ADO_REPORTS_DB": str(self.path), "ADO_REPORTS_IP_SALT": "test-only-" * 5})
        self.env.start()
        app = FastAPI()
        app.add_middleware(ReportsBodyLimit)
        app.include_router(router)
        self.client = TestClient(app)
        self.headers = {"Authorization": "Bearer " + "a" * 64}
        self.body = {"request_id": "12345678-1234-1234-1234-123456789012", "kind": "bug", "category": "display",
                     "title": "Display issue", "description": "The settings page is not displaying correctly.",
                     "steps": "Open settings then change language.", "consent": True}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def post(self, body=None, headers=None):
        return self.client.post("/api/reports", json=body or self.body, headers=headers or self.headers)

    def test_submit_receipt_and_lookup(self):
        result = self.post()
        self.assertEqual(result.status_code, 201)
        self.assertRegex(result.json()["id"], r"^AFH-[A-F0-9]{16}$")
        self.assertEqual(result.json()["status"], "received")
        self.assertEqual(result.headers["cache-control"], "no-store")
        records = self.client.get("/api/reports", headers=self.headers).json()["reports"]
        self.assertEqual(len(records), 1)
        self.assertNotIn("description", records[0])

    def test_private_records(self):
        self.post()
        other = {"Authorization": "Bearer " + "b" * 64}
        self.assertEqual(self.client.get("/api/reports", headers=other).json()["reports"], [])
        self.assertEqual(self.client.get("/api/reports").status_code, 401)
        self.assertEqual(self.client.get("/api/reports?token=" + "a" * 64).status_code, 401)

    def test_idempotent_and_conflicting_retry(self):
        first = self.post().json()
        retry = self.post()
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first["id"], retry.json()["id"])
        self.assertEqual(self.post({**self.body, "title": "Changed title"}).status_code, 409)

    def test_validation(self):
        for change in [{"title": "    "}, {"description": "short"}, {"consent": False}, {"steps": ""},
                       {"category": "spam"}, {"title": "x" * 121}, {"description": "x" * 4001}, {"unknown": "field"}]:
            with self.subTest(change=list(change)):
                self.assertEqual(self.post({**self.body, **change}).status_code, 422)

    def test_content_requires_target(self):
        content = {**self.body, "kind": "content", "category": "rights", "steps": ""}
        self.assertEqual(self.post(content).status_code, 422)
        self.assertEqual(self.post({**content, "target": "history:sample"}).status_code, 201)

    def test_owner_rate_limit_and_retry(self):
        for n in range(5):
            self.assertEqual(self.post({**self.body, "request_id": f"{n:036d}"}).status_code, 201)
        response = self.post()
        self.assertEqual(response.status_code, 429)
        self.assertIn("retry-after", response.headers)
        self.assertEqual(self.post({**self.body, "request_id": f"{0:036d}"}).status_code, 200)

    def test_ip_limit_survives_new_owners(self):
        for n in range(30):
            self.assertEqual(self.post(headers={"Authorization": f"Bearer {n:064x}"}).status_code, 201)
        self.assertEqual(self.post(headers={"Authorization": "Bearer " + "f" * 64}).status_code, 429)

    def test_disabled_and_uninitialized_fail_closed(self):
        with patch.dict(os.environ, {"ADO_REPORTS_ENABLED": "0"}):
            self.assertEqual(self.post().status_code, 503)
        with patch.dict(os.environ, {"ADO_REPORTS_IP_SALT": ""}):
            self.assertEqual(self.post().status_code, 503)
        missing = str(Path(self.temp.name) / "missing.sqlite3")
        with patch.dict(os.environ, {"ADO_REPORTS_DB": missing}):
            self.assertEqual(self.post().status_code, 503)
            self.assertFalse(Path(missing).exists())

    def test_body_limit(self):
        self.assertEqual(self.client.post("/api/reports", content=b"x" * 32769, headers=self.headers).status_code, 413)

    def test_chunked_body_limit(self):
        self.assertEqual(self.client.post("/api/reports", content=iter([b"x" * 20000, b"x" * 20000]), headers=self.headers).status_code, 413)

    def test_concurrent_retry_creates_one_case(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(lambda _: self.post(), range(4)))
        self.assertEqual(sorted(r.status_code for r in responses), [200, 200, 200, 201])
        self.assertEqual(len({r.json()["id"] for r in responses}), 1)

    def test_persisted_state_and_private_storage(self):
        case_id = self.post().json()["id"]
        db = sqlite3.connect(self.path)
        try:
            row = db.execute("SELECT owner FROM reports WHERE id=?", (case_id,)).fetchone()
            self.assertNotEqual(row[0], "a" * 64)
            db.execute("UPDATE reports SET status='reviewing' WHERE id=?", (case_id,))
            db.commit()
        finally:
            db.close()
        records = self.client.get("/api/reports", headers=self.headers).json()["reports"]
        self.assertEqual(records[0]["status"], "reviewing")

    def test_read_limit(self):
        for _ in range(120):
            self.assertEqual(self.client.get("/api/reports", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/reports", headers=self.headers).status_code, 429)

    def test_init_refuses_existing_file(self):
        with self.assertRaises(FileExistsError):
            initialize(self.path)

    def test_local_admin_updates_status_and_audit(self):
        from reports_admin import main
        case_id = self.post().json()["id"]
        with patch("sys.argv", ["reports_admin", "status", case_id, "reviewing"]), redirect_stdout(io.StringIO()):
            main()
        db = sqlite3.connect(self.path)
        try:
            self.assertEqual(db.execute("SELECT status FROM reports WHERE id=?", (case_id,)).fetchone()[0], "reviewing")
            self.assertEqual(db.execute("SELECT count(*) FROM audit WHERE case_id=?", (case_id,)).fetchone()[0], 2)
        finally:
            db.close()

    def test_dev_entrypoint_cors_and_body_limit(self):
        from reports_dev import app
        with TestClient(app) as client:
            origin = {"Origin": "http://localhost:8081"}
            preflight = client.options("/api/reports", headers={**origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type"})
            self.assertEqual(preflight.status_code, 200)
            oversized = client.post("/api/reports", headers=origin, content=b"x" * 32769)
            self.assertEqual(oversized.status_code, 413)
            self.assertEqual(oversized.headers["access-control-allow-origin"], "http://localhost:8081")


if __name__ == "__main__":
    unittest.main()

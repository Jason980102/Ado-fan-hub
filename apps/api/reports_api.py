"""Closed-test reports. Separate opt-in SQLite store; never uses History DB."""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import closing, contextmanager
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request, Response
import psycopg
import reports_postgres
from pydantic import BaseModel, ConfigDict, Field, model_validator

router = APIRouter(prefix="/api/reports", tags=["Reports"])
STATES = ("received", "reviewing", "resolved", "closed")


class ReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    request_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    kind: Literal["bug", "content"]
    category: Literal["crash", "display", "data", "other", "spam", "harassment", "rights", "unsafe"]
    title: str = Field(min_length=5, max_length=120)
    description: str = Field(min_length=20, max_length=4000)
    target: str = Field(default="", max_length=500)
    steps: str = Field(default="", max_length=2000)
    expected: str = Field(default="", max_length=1000)
    environment: str = Field(default="", max_length=200)
    consent: Literal[True]

    @model_validator(mode="after")
    def check_kind(self):
        allowed = {"bug": {"crash", "display", "data", "other"},
                   "content": {"spam", "harassment", "rights", "unsafe", "other"}}
        if self.category not in allowed[self.kind]:
            raise ValueError("Category does not match report kind")
        if self.kind == "content" and len(self.target) < 3:
            raise ValueError("Content reports require a page, content ID or URL")
        if self.kind == "bug" and len(self.steps) < 10:
            raise ValueError("Bug reports require reproduction steps")
        return self


def store_path():
    raw = os.environ.get("ADO_REPORTS_DB", "")
    if not raw or not Path(raw).is_absolute():
        raise RuntimeError("ADO_REPORTS_DB must be an absolute path")
    return Path(raw)


def initialize(path: Path):
    """Explicit administrative setup only. Refuse to overwrite any existing file."""
    if not path.is_absolute():
        raise ValueError("Use an absolute path")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb"):
        pass
    with closing(sqlite3.connect(path)) as db, db:
        db.executescript("""
        CREATE TABLE reports (
          id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL,
          fingerprint TEXT NOT NULL, payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','resolved','closed')),
          created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
          UNIQUE(owner, request_id));
        CREATE INDEX reports_owner ON reports(owner, created_at);
        CREATE TABLE limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
        CREATE TABLE audit (case_id TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL);
        PRAGMA user_version=1;
        """)


@contextmanager
def connection():
    db = None
    try:
        db = sqlite3.connect(store_path().as_uri() + "?mode=rw", uri=True, timeout=5)
        db.row_factory = sqlite3.Row
        if db.execute("PRAGMA user_version").fetchone()[0] != 1:
            raise RuntimeError("Reports schema not initialized")
        yield db
    except (sqlite3.Error, RuntimeError, OSError):
        raise HTTPException(503, "Reports temporarily unavailable") from None
    finally:
        if db is not None:
            db.close()


def identity(request: Request, authorization: str | None):
    salt = os.environ.get("ADO_REPORTS_IP_SALT", "")
    if os.environ.get("ADO_REPORTS_ENABLED") != "1" or len(salt) < 32:
        raise HTTPException(503, "Reports temporarily unavailable")
    if not authorization or not re.fullmatch(r"Bearer [0-9a-f]{64}", authorization):
        raise HTTPException(401, "Private lookup credential required")
    owner = hashlib.sha256(authorization[7:].encode()).hexdigest()
    # Ignore untrusted X-Forwarded-For. Run uvicorn with --no-proxy-headers.
    address = request.client.host if request.client else "unknown"
    ip = hmac.new(salt.encode(), address.encode(), hashlib.sha256).hexdigest()
    return owner, ip


def throttle(db, key, maximum, now):
    window = now // 3600
    row = db.execute("SELECT window,count FROM limits WHERE key=?", (key,)).fetchone()
    count = row["count"] if row and row["window"] == window else 0
    if count >= maximum:
        raise HTTPException(429, "Too many requests; try later", headers={"Retry-After": str(3600 - now % 3600)})
    db.execute("INSERT INTO limits VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET window=excluded.window,count=excluded.count",
               (key, window, count + 1))


def receipt(row):
    data = json.loads(row["payload"])
    return {"id": row["id"], "kind": data["kind"], "title": data["title"],
            "status": row["status"], "created_at": row["created_at"], "updated_at": row["updated_at"]}


def postgres_enabled():
    return os.environ.get("ADO_REPORTS_STORE", "sqlite") == "postgres"


def postgres_failure(error):
    if isinstance(error, reports_postgres.ReportConflict):
        raise HTTPException(409, str(error)) from None
    if isinstance(error, reports_postgres.ReportRateLimited):
        raise HTTPException(
            429,
            "Too many requests; try later",
            headers={"Retry-After": str(error.retry_after)},
        ) from None
    raise HTTPException(503, "Reports temporarily unavailable") from None

@router.post("", status_code=201)
def submit(data: ReportInput, request: Request, response: Response, authorization: str | None = Header(default=None)):
    owner, ip = identity(request, authorization)
    response.headers["Cache-Control"] = "no-store"
    payload = data.model_dump_json()
    if postgres_enabled():
        try:
            result, created = reports_postgres.submit_report(
                owner, ip, data.request_id, payload
            )
        except (
            reports_postgres.ReportConflict,
            reports_postgres.ReportRateLimited,
            psycopg.Error,
            RuntimeError,
            OSError,
        ) as error:
            postgres_failure(error)
        if not created:
            response.status_code = 200
        return result

    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    now = int(time.time())
    with connection() as db, db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT * FROM reports WHERE owner=? AND request_id=?", (owner, data.request_id)).fetchone()
        if existing:
            if existing["fingerprint"] != fingerprint:
                raise HTTPException(409, "Request ID already used with different content")
            response.status_code = 200
            return receipt(existing)
        throttle(db, "submit-owner:" + owner, 5, now)
        throttle(db, "submit-ip:" + ip, 30, now)
        throttle(db, "submit-global", 500, now)
        db.execute("DELETE FROM limits WHERE window < ?", (now // 3600 - 24,))
        case_id = "AFH-" + secrets.token_hex(8).upper()
        db.execute("INSERT INTO reports(id,owner,request_id,fingerprint,payload,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                   (case_id, owner, data.request_id, fingerprint, payload, now, now))
        db.execute("INSERT INTO audit VALUES (?,?,?)", (case_id, "received", now))
        return receipt(db.execute("SELECT * FROM reports WHERE id=?", (case_id,)).fetchone())


@router.get("")
def records(request: Request, response: Response, authorization: str | None = Header(default=None)):
    owner, ip = identity(request, authorization)
    response.headers["Cache-Control"] = "no-store"
    if postgres_enabled():
        try:
            return reports_postgres.list_own_reports(owner, ip)
        except (
            reports_postgres.ReportRateLimited,
            psycopg.Error,
            RuntimeError,
            OSError,
        ) as error:
            postgres_failure(error)

    with connection() as db, db:
        db.execute("BEGIN IMMEDIATE")
        throttle(db, "read-ip:" + ip, 120, int(time.time()))
        rows = db.execute("SELECT * FROM reports WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 50", (owner,)).fetchall()
        return {"reports": [receipt(row) for row in rows]}

"""PostgreSQL storage for Reports. Not enabled by default."""

import hashlib
import json
import os
import secrets
import time

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

STATES = ("received", "reviewing", "resolved", "closed")

# Serialize rate-limit updates across application workers.
RATE_LOCK_ID = 7240426


class ReportConflict(Exception):
    pass


class ReportRateLimited(Exception):
    def __init__(self, retry_after):
        self.retry_after = retry_after
        super().__init__("Rate limit exceeded")


def connect():
    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("PostgreSQL DATABASE_URL required")
    return psycopg.connect(
        url,
        connect_timeout=10,
        row_factory=dict_row,
    )


def receipt(row):
    payload = row["payload"]
    if isinstance(payload, str):
        payload = json.loads(payload)

    return {
        "id": row["id"],
        "kind": payload["kind"],
        "title": payload["title"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def throttle(cur, key, maximum, now):
    window = now // 3600
    retry_after = 3600 - now % 3600

    cur.execute(
        """
        INSERT INTO reports_rate_limits
            (key, window, count)
        VALUES (%s, %s, 1)
        ON CONFLICT (key)
        DO UPDATE SET
            window = EXCLUDED.window,
            count = CASE
                WHEN reports_rate_limits.window = EXCLUDED.window
                THEN reports_rate_limits.count + 1
                ELSE 1
            END
        RETURNING count
        """,
        (key, window),
    )
    count = cur.fetchone()["count"]

    if count > maximum:
        raise ReportRateLimited(retry_after)


def submit_report(owner, ip, request_id, payload):
    now = int(time.time())

    # Preserve the existing API fingerprint calculation.
    if not isinstance(payload, str):
        raise TypeError("payload must be the validated JSON string")
    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    parsed_payload = json.loads(payload)

    with connect() as conn:
        with conn.cursor() as cur:
            # Protect the check/insert and shared rate-limit sequence.
            cur.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (RATE_LOCK_ID,),
            )

            cur.execute(
                """
                SELECT * FROM reports_cases
                WHERE owner = %s AND request_id = %s
                """,
                (owner, request_id),
            )
            existing = cur.fetchone()

            if existing:
                if existing["fingerprint"] != fingerprint:
                    raise ReportConflict(
                        "Request ID already used with different content"
                    )
                return receipt(existing), False

            throttle(cur, "submit-owner:" + owner, 5, now)
            throttle(cur, "submit-ip:" + ip, 30, now)
            throttle(cur, "submit-global", 500, now)

            cur.execute(
                "DELETE FROM reports_rate_limits WHERE window < %s",
                (now // 3600 - 24,),
            )

            case_id = "AFH-" + secrets.token_hex(8).upper()

            cur.execute(
                """
                INSERT INTO reports_cases
                    (id, owner, request_id, fingerprint,
                     payload, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'received', %s, %s)
                RETURNING *
                """,
                (
                    case_id,
                    owner,
                    request_id,
                    fingerprint,
                    Jsonb(parsed_payload),
                    now,
                    now,
                ),
            )
            created = cur.fetchone()

            cur.execute(
                """
                INSERT INTO reports_case_audit (case_id, status, at)
                VALUES (%s, 'received', %s)
                """,
                (case_id, now),
            )

            return receipt(created), True


def list_own_reports(owner, ip):
    now = int(time.time())

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT pg_advisory_xact_lock(%s)",
                (RATE_LOCK_ID,),
            )
            throttle(cur, "read-ip:" + ip, 120, now)

            cur.execute(
                """
                SELECT * FROM reports_cases
                WHERE owner = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 50
                """,
                (owner,),
            )
            return {
                "reports": [receipt(row) for row in cur.fetchall()]
            }


def admin_list():
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, status FROM reports_cases
                ORDER BY created_at DESC, id DESC
                LIMIT 50
                """
            )
            return cur.fetchall()


def admin_show(case_id):
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT payload FROM reports_cases WHERE id = %s",
                (case_id,),
            )
            return cur.fetchone()


def admin_set_status(case_id, status):
    if status not in STATES:
        raise ValueError("Invalid report status")

    now = int(time.time())

    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE reports_cases
                SET status = %s, updated_at = %s
                WHERE id = %s
                RETURNING id
                """,
                (status, now, case_id),
            )

            if cur.fetchone() is None:
                return False

            cur.execute(
                """
                INSERT INTO reports_case_audit (case_id, status, at)
                VALUES (%s, %s, %s)
                """,
                (case_id, status, now),
            )
            return True
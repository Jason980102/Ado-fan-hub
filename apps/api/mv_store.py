"""Persistent storage for the last complete MV catalog snapshot."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB_PATH = (
    Path(__file__).resolve().parent
    / "data"
    / "mv_catalog.sqlite3"
)


@contextmanager
def _connect(db_path):
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(path), timeout=10)

    try:
        conn.execute("PRAGMA busy_timeout = 10000")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_snapshot (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                saved_at TEXT NOT NULL
            )
        """)

        with conn:
            yield conn
    finally:
        conn.close()


def save_catalog(catalog, db_path=None):
    """Atomically replace the last complete catalog snapshot."""
    if db_path is None:
        db_path = DEFAULT_DB_PATH

    if catalog.partial:
        raise ValueError("Refusing to save a partial catalog")

    payload = catalog.model_dump_json()
    saved_at = datetime.now(timezone.utc).isoformat()

    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO catalog_snapshot (id, payload, saved_at)
            VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                payload = excluded.payload,
                saved_at = excluded.saved_at
            """,
            (payload, saved_at),
        )


def load_catalog(db_path=None):
    """Return the stored catalog JSON dictionary, or None."""
    if db_path is None:
        db_path = DEFAULT_DB_PATH

    if not Path(db_path).exists():
        return None

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT payload FROM catalog_snapshot WHERE id = 1"
        ).fetchone()

    if row is None:
        return None

    return json.loads(row[0])


def get_store_status(db_path=None):
    """Return storage status without exposing database contents."""
    if db_path is None:
        db_path = DEFAULT_DB_PATH

    if not Path(db_path).exists():
        return {"has_snapshot": False, "saved_at": None}

    with _connect(db_path) as conn:
        row = conn.execute(
            "SELECT saved_at FROM catalog_snapshot WHERE id = 1"
        ).fetchone()

    return {
        "has_snapshot": row is not None,
        "saved_at": row[0] if row else None,
    }

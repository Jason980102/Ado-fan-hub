"""Shared daily reference rates. Provider adapters never receive user data."""
import json
import logging
import math
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler

from fastapi import APIRouter, HTTPException, Response

router = APIRouter(prefix="/api/fx", tags=["Reference exchange rates"])
log = logging.getLogger(__name__)
UTC = timezone.utc


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError("Unexpected exchange rate redirect")


def fetch_frankfurter(now):
    request = Request(
        "https://api.frankfurter.dev/v2/rates?base=JPY&quotes=USD,TWD",
        headers={"Accept": "application/json", "User-Agent": "AdoFanHub/FX"},
    )
    with build_opener(NoRedirect()).open(request, timeout=8) as response:
        body = response.read(65_537)
    if len(body) > 65_536:
        raise ValueError("Exchange rate response too large")
    return parse_frankfurter(json.loads(body), now)


def parse_frankfurter(rows, now):
    if not isinstance(rows, list):
        raise ValueError("Invalid exchange rate response")
    rates, dates = {"JPY": 1}, {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid exchange rate row")
        quote, rate = row.get("quote"), row.get("rate")
        if row.get("base") != "JPY" or quote not in ("USD", "TWD") or quote in dates:
            raise ValueError("Unexpected or duplicate currency")
        if type(rate) not in (int, float) or not math.isfinite(rate) or rate <= 0:
            raise ValueError("Invalid exchange rate")
        rate_date = date.fromisoformat(row["date"])
        if rate_date.isoformat() != row["date"] or rate_date > now.date():
            raise ValueError("Invalid exchange rate date")
        rates[quote], dates[quote] = rate, rate_date.isoformat()
    if set(dates) != {"USD", "TWD"}:
        raise ValueError("Required exchange rates unavailable")
    return {"source": "Frankfurter", "rates": rates, "dates": dates}


class FxStore:
    """SQLite leases deduplicate threads AND workers sharing the same local file.

    Multiple hosts must use a shared database implementation of this interface,
    not separate local SQLite files or SQLite on a network filesystem.
    """
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as conn:
            conn.execute("""CREATE TABLE IF NOT EXISTS fx_snapshot (
                id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT,
                next_attempt REAL NOT NULL DEFAULT 0,
                lease_until REAL NOT NULL DEFAULT 0, owner TEXT,
                failed INTEGER NOT NULL DEFAULT 0)""")
            conn.execute("INSERT OR IGNORE INTO fx_snapshot(id) VALUES(1)")

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(str(self.path), timeout=5)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def read(self):
        with self.connect() as conn:
            return dict(conn.execute("SELECT * FROM fx_snapshot WHERE id=1").fetchone())

    def claim(self, now, owner):
        with self.connect() as conn:
            return conn.execute("""UPDATE fx_snapshot SET owner=?, lease_until=?
                WHERE id=1 AND next_attempt<=? AND lease_until<=?""",
                (owner, now + 60, now, now)).rowcount == 1

    def finish(self, owner, payload, next_attempt, failed):
        with self.connect() as conn:
            conn.execute("""UPDATE fx_snapshot SET payload=COALESCE(?,payload),
                next_attempt=?, failed=?, lease_until=0, owner=NULL
                WHERE id=1 AND owner=?""",
                (json.dumps(payload) if payload is not None else None,
                 next_attempt, int(failed), owner))


class FxService:
    def __init__(self, store, fetch=fetch_frankfurter, clock=None):
        self.store, self.fetch = store, fetch
        self.clock = clock or (lambda: datetime.now(UTC))

    def get(self):
        now = self.clock().astimezone(UTC)
        timestamp = now.timestamp()
        row = self.store.read()
        if timestamp >= row["next_attempt"]:
            owner = uuid.uuid4().hex
            if self.store.claim(timestamp, owner):
                try:
                    payload = self.fetch(now)
                    old = json.loads(row["payload"]) if row["payload"] else None
                    if old and any(payload["dates"][q] < old["dates"][q] for q in ("USD", "TWD")):
                        raise ValueError("Exchange rate date regression")
                    checked = self.clock().astimezone(UTC)
                    payload = {**payload, "fetchedAt": checked.isoformat(),
                               "checkedAt": checked.isoformat()}
                    # Recheck publication delays; a UTC date boundary always expires.
                    interval = 900 if any(d < checked.date().isoformat() for d in payload["dates"].values()) else 3600
                    midnight = datetime.combine(checked.date() + timedelta(days=1), datetime.min.time(), UTC)
                    next_attempt = min(checked.timestamp() + interval, midnight.timestamp())
                    self.store.finish(owner, payload, next_attempt, False)
                except Exception:
                    log.warning("Reference exchange rate refresh failed", exc_info=True)
                    self.store.finish(owner, None, self.clock().timestamp() + 300, True)
            row = self.store.read()
        if not row["payload"]:
            raise HTTPException(503, "Reference exchange rates temporarily unavailable",
                                headers={"Retry-After": "5"})
        payload = json.loads(row["payload"])
        current = self.clock().astimezone(UTC)
        return {**payload,
                "nextCheckAt": datetime.fromtimestamp(row["next_attempt"], UTC).isoformat(),
                "stale": bool(row["failed"] or current.timestamp() >= row["next_attempt"]),
                "awaitingPublication": any(d < current.date().isoformat() for d in payload["dates"].values())}


_service = None
_service_lock = threading.Lock()


def get_service():
    global _service
    with _service_lock:
        if _service is None:
            path = os.environ.get("FX_DB_PATH") or Path(__file__).resolve().parent / "data" / "fx.sqlite3"
            _service = FxService(FxStore(path))
        return _service


@router.get("/rates")
def rates(response: Response):
    try:
        result = get_service().get()
    except HTTPException:
        raise
    except Exception:
        log.exception("Reference exchange rate storage unavailable")
        raise HTTPException(503, "Reference exchange rates temporarily unavailable") from None
    # Clients check the shared cache; no per-user data or force-refresh endpoint.
    response.headers["Cache-Control"] = "no-store"
    return result


class FxWorker:
    """Independent from the serial MV queue; all processes share a store lease."""
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, name="fx-refresh", daemon=True)

    def start(self):
        self.thread.start()

    def run(self):
        # Avoid blocking startup. Check due work even when there are no users.
        if self.stop_event.wait(1):
            return
        while not self.stop_event.is_set():
            try:
                get_service().get()
            except Exception:
                log.warning("Reference exchange rate background check failed")
            self.stop_event.wait(60)

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=12)

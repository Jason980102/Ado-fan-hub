"""Serial background scheduler for MV synchronization."""

import logging
import threading
import time
from datetime import datetime, timezone

log = logging.getLogger(__name__)


class MVSyncScheduler:
    def __init__(self, jobs, clock=None, start_delayed=False):
        """
        jobs: mapping of name -> (interval_seconds, callback).
        All callbacks run serially, never concurrently.
        """
        self._clock = clock or time.monotonic
        self._jobs = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

        now = self._clock()

        for name, (interval, callback) in jobs.items():
            if interval <= 0 or not callable(callback):
                raise ValueError("Invalid scheduled job")

            self._jobs[name] = {
                "interval": interval,
                "callback": callback,
                "next_due": now + interval if start_delayed else now,
                "last_success": None,
                "last_error": None,
                "runs": 0,
            }

    def run_due(self):
        """Run due jobs once. Safe against overlapping calls."""
        if not self._lock.acquire(blocking=False):
            return False

        try:
            for name, job in self._jobs.items():
                if self._stop.is_set():
                    break

                if self._clock() < job["next_due"]:
                    continue

                try:
                    job["callback"]()
                    job["last_success"] = (
                        datetime.now(timezone.utc).isoformat()
                    )
                    job["last_error"] = None
                except Exception as exc:
                    job["last_error"] = type(exc).__name__
                    log.exception("MV sync job failed: %s", name)
                finally:
                    job["runs"] += 1
                    job["next_due"] = (
                        self._clock() + job["interval"]
                    )

            return True
        finally:
            self._lock.release()

    def _loop(self):
        while not self._stop.is_set():
            self.run_due()
            self._stop.wait(1)

    def start(self):
        if self._thread is not None and self._thread.is_alive():
            return False

        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop,
            name="mv-sync",
            daemon=True,
        )
        self._thread.start()
        return True

    def stop(self, timeout=20):
        self._stop.set()

        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=timeout)

        return thread is None or not thread.is_alive()

    def status(self):
        with self._lock:
            return {
                "running": (
                    self._thread is not None
                    and self._thread.is_alive()
                ),
                "jobs": {
                    name: {
                        "interval_seconds": job["interval"],
                        "runs": job["runs"],
                        "last_success": job["last_success"],
                        "last_error": job["last_error"],
                    }
                    for name, job in self._jobs.items()
                },
            }

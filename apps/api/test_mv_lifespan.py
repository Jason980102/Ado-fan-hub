import asyncio
import unittest

import main
from mv_sync import MVSyncScheduler


class MVLifespanTests(unittest.TestCase):

    def test_delayed_initial_run(self):
        clock = [0]
        calls = []

        scheduler = MVSyncScheduler(
            {"feed": (300, lambda: calls.append("feed"))},
            clock=lambda: clock[0],
            start_delayed=True,
        )

        scheduler.run_due()
        self.assertEqual(calls, [])

        clock[0] = 300
        scheduler.run_due()
        self.assertEqual(calls, ["feed"])

    def test_lifespan_starts_and_stops_scheduler(self):
        async def check():
            async with main.mv_lifespan(main.app):
                scheduler = main.app.state.mv_sync
                self.assertTrue(scheduler.status()["running"])
                self.assertEqual(
                    set(scheduler.status()["jobs"]),
                    {"feed", "playlists", "uploads"},
                )

            self.assertIsNone(main.app.state.mv_sync)

        asyncio.run(check())

    def test_sync_intervals(self):
        async def check():
            async with main.mv_lifespan(main.app):
                status = main.mv_sync_status()

                intervals = {
                    name: job["interval_seconds"]
                    for name, job in status["jobs"].items()
                }

                self.assertEqual(
                    intervals,
                    {
                        "feed": 300,
                        "playlists": 900,
                        "uploads": 21600,
                    },
                )

        asyncio.run(check())


if __name__ == "__main__":
    unittest.main()

import unittest

from mv_sync import MVSyncScheduler


class SchedulerTests(unittest.TestCase):
    def test_jobs_run_when_due(self):
        clock = [0]
        calls = []

        scheduler = MVSyncScheduler(
            {"feed": (300, lambda: calls.append("feed"))},
            clock=lambda: clock[0],
        )

        scheduler.run_due()
        self.assertEqual(calls, ["feed"])

        clock[0] = 299
        scheduler.run_due()
        self.assertEqual(len(calls), 1)

        clock[0] = 300
        scheduler.run_due()
        self.assertEqual(len(calls), 2)

    def test_multiple_job_intervals(self):
        clock = [0]
        calls = []

        scheduler = MVSyncScheduler(
            {
                "feed": (300, lambda: calls.append("feed")),
                "playlists": (
                    900, lambda: calls.append("playlists")
                ),
                "uploads": (
                    21600, lambda: calls.append("uploads")
                ),
            },
            clock=lambda: clock[0],
        )

        scheduler.run_due()
        self.assertEqual(len(calls), 3)

        clock[0] = 300
        scheduler.run_due()
        self.assertEqual(calls.count("feed"), 2)
        self.assertEqual(calls.count("playlists"), 1)
        self.assertEqual(calls.count("uploads"), 1)

        clock[0] = 900
        scheduler.run_due()
        self.assertEqual(calls.count("playlists"), 2)

    def test_failure_does_not_stop_other_jobs(self):
        calls = []

        def broken():
            raise ValueError("simulated failure")

        scheduler = MVSyncScheduler({
            "broken": (300, broken),
            "healthy": (
                300, lambda: calls.append("healthy")
            ),
        })

        scheduler.run_due()

        self.assertEqual(calls, ["healthy"])
        self.assertEqual(
            scheduler.status()["jobs"]["broken"]["last_error"],
            "ValueError",
        )
        self.assertIsNotNone(
            scheduler.status()["jobs"]["healthy"]["last_success"]
        )

    def test_same_scheduler_does_not_overlap(self):
        scheduler = MVSyncScheduler({
            "job": (300, lambda: None),
        })

        scheduler._lock.acquire()
        try:
            self.assertFalse(scheduler.run_due())
        finally:
            scheduler._lock.release()

    def test_start_and_stop(self):
        scheduler = MVSyncScheduler({
            "job": (300, lambda: None),
        })

        self.assertTrue(scheduler.start())
        self.assertFalse(scheduler.start())
        self.assertTrue(scheduler.stop())
        self.assertFalse(scheduler.status()["running"])


if __name__ == "__main__":
    unittest.main()

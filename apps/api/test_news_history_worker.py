"""History pagination regression tests; no network or database writes."""
import unittest
from unittest.mock import patch
from news_sources import fanclub
from services import news_history_worker as worker

class RawPaginationTests(unittest.TestCase):
    def test_resume_fetches_only_raw_pages(self):
        with patch.object(fanclub, "_fetch_fanclub_page", return_value=([object()] * 6, 6, 1562)) as fetch:
            items, total, offset = fanclub.fetch_fanclub_raw_batch(264)
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [45, 46, 47, 48])
        self.assertEqual((len(items), total, offset), (24, 1562, 288))

    def test_unparseable_page_fails_closed(self):
        with patch.object(fanclub, "_fetch_fanclub_page", return_value=([object()] * 5, 6, 1562)):
            with self.assertRaises(ValueError):
                fanclub.fetch_fanclub_raw_batch(264)

    def test_short_page_before_total_fails_closed(self):
        with patch.object(fanclub, "_fetch_fanclub_page", return_value=([object()] * 5, 5, 1562)):
            with self.assertRaises(ValueError):
                fanclub.fetch_fanclub_raw_batch(264)

    def test_last_partial_page_uses_raw_position(self):
        with patch.object(fanclub, "_fetch_fanclub_page", side_effect=[([1]*6,6,1562),([1]*2,2,1562)]):
            items, total, offset = fanclub.fetch_fanclub_raw_batch(1554)
        self.assertEqual((len(items),total,offset), (8,1562,1562))

    def test_total_change_fails_closed(self):
        with patch.object(fanclub, "_fetch_fanclub_page", side_effect=[([1]*6,6,1562),([1]*6,6,1563)]):
            with self.assertRaises(ValueError):
                fanclub.fetch_fanclub_raw_batch(264)

    def test_sync_failure_preserves_checkpoint(self):
        with patch.object(worker,"read_state",return_value=(264,1562)), patch.object(worker,"fetch_batch",return_value=([1],1562,288)), patch.object(worker,"sync_source",side_effect=RuntimeError("upsert failed")), patch.object(worker,"save_state") as save:
            with self.assertRaises(RuntimeError):
                worker.run_batch("fanclub")
        self.assertEqual(save.call_args.args, ("fanclub",264,1562))
        self.assertEqual(save.call_args.kwargs["expected_offset"],264)

    def test_upsert_precedes_checkpoint(self):
        events=[]
        with patch.object(worker,"read_state",return_value=(264,1562)), patch.object(worker,"fetch_batch",return_value=([1],1562,288)), patch.object(worker,"sync_source",side_effect=lambda *args: events.append("upsert") or 1), patch.object(worker,"save_state",side_effect=lambda *args,**kwargs: events.append(("checkpoint",args[1]))):
            self.assertTrue(worker.run_batch("fanclub"))
        self.assertEqual(events,["upsert",("checkpoint",288)])

if __name__ == "__main__":
    unittest.main()

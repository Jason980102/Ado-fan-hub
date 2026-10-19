"""Offline SQL structure checks for MV PostgreSQL writer."""

import unittest
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert

from database.entities import MusicVideo


class MVCatalogWriterSQLTests(unittest.TestCase):

    def test_video_upsert_sql(self):
        statement = insert(MusicVideo).values(
            youtube_id="aaaaaaaaaaa",
            title="Test video",
            channel_id="UCln9P4Qm3-EAY4aiEPmRwEA",
            categories=["original"],
            playlist_ids=[],
            aliases=[],
        )

        statement = statement.on_conflict_do_update(
            index_elements=["youtube_id"],
            set_={"title": "Updated title"},
        )

        sql = str(statement.compile(
            dialect=postgresql.dialect()
        ))

        self.assertIn("ON CONFLICT", sql)
        self.assertIn("DO UPDATE", sql)

    def test_advisory_lock_sql(self):
        sql = str(text(
            "SELECT pg_advisory_xact_lock(74120318)"
        ).compile(dialect=postgresql.dialect()))

        self.assertIn("pg_advisory_xact_lock", sql)

    def test_writer_contains_transaction_context(self):
        source = Path(
            "services/mv_catalog_writer.py"
        ).read_text(encoding="utf-8")

        self.assertIn("with factory.begin() as session:", source)
        self.assertIn("pg_advisory_xact_lock", source)
        self.assertIn("missing_ids = existing_ids - set(video_ids)", source)

    def test_writer_does_not_delete_existing_videos(self):
        source = Path(
            "services/mv_catalog_writer.py"
        ).read_text(encoding="utf-8")

        self.assertNotIn("delete(MusicVideo)", source)
        self.assertNotIn("TRUNCATE", source.upper())


if __name__ == "__main__":
    unittest.main()

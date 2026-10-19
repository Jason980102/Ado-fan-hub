"""Offline contract tests for a future playlist-only PostgreSQL writer."""

import unittest

from sqlalchemy import update
from sqlalchemy.dialects import postgresql

from database.entities import MusicVideo


class PlaylistWriterContractTests(unittest.TestCase):

    def test_playlist_update_only_changes_allowed_columns(self):
        statement = (
            update(MusicVideo)
            .where(MusicVideo.youtube_id == "abcdefghijk")
            .values(
                categories=["original"],
                playlist_ids=["playlist-test"],
            )
        )

        values = {
            column.key
            for column in statement._values
        }

        self.assertEqual(
            values,
            {"categories", "playlist_ids"},
        )

        sql = str(
            statement.compile(
                dialect=postgresql.dialect()
            )
        )

        self.assertIn("UPDATE", sql)
        self.assertIn("categories", sql)
        self.assertIn("playlist_ids", sql)

    def test_playlist_update_does_not_touch_statistics(self):
        statement = update(MusicVideo).values(
            categories=["cover"],
            playlist_ids=["playlist-test"],
        )

        columns = {
            column.key
            for column in statement._values
        }

        protected = {
            "view_count",
            "like_count",
            "title",
            "channel_id",
            "channel_title",
            "published_at",
            "thumbnail_url",
            "aliases",
        }

        self.assertFalse(columns & protected)

    def test_video_identity_is_preserved(self):
        statement = (
            update(MusicVideo)
            .where(MusicVideo.youtube_id == "abcdefghijk")
            .values(
                categories=["unclassified"],
                playlist_ids=[],
            )
        )

        columns = {
            column.key
            for column in statement._values
        }

        self.assertNotIn("youtube_id", columns)


if __name__ == "__main__":
    unittest.main()

"""Offline regression tests for the playlist-only PostgreSQL writer."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import Column, Integer, JSON, MetaData, Table, DateTime
from sqlalchemy.sql.dml import Update

from mv_catalog import CatalogSource, SOURCES
from services.mv_playlist_writer import save_playlist_memberships


class PlaylistWriterTests(unittest.TestCase):

    def test_incomplete_memberships_rejected_before_db(self):
        with patch(
            "services.mv_playlist_writer.create_db_engine"
        ) as engine:
            with self.assertRaises(ValueError):
                save_playlist_memberships({}, {})
            engine.assert_not_called()

    def test_video_update_changes_only_playlist_columns(self):
        session = MagicMock()

        video = SimpleNamespace(
            youtube_id="abcdefghijk",
            playlist_ids=["old-playlist"],
            categories=["unclassified"],
        )

        session.scalars.return_value.all.return_value = [video]

        state_result = MagicMock()
        state_result.one_or_none.return_value = SimpleNamespace(
            sources=[],
            partial=False,
        )

        session.execute.return_value = state_result

        factory = MagicMock()
        factory.begin.return_value.__enter__.return_value = session

        engine = MagicMock()
        memberships = {
            pid: set()
            for pid in SOURCES
        }
        first = next(iter(SOURCES))
        memberships[first].add(video.youtube_id)

        sources = {
            pid: CatalogSource(
                id=pid,
                title=title,
                available=True,
                item_count=len(memberships[pid]),
            )
            for pid, (title, _) in SOURCES.items()
        }

        with (
            patch(
                "services.mv_playlist_writer.create_db_engine",
                return_value=engine,
            ),
            patch(
                "services.mv_playlist_writer.create_session_factory",
                return_value=factory,
            ),
            patch(
                "services.mv_playlist_writer.Table",
                return_value=Table(
                    "mv_catalog_state",
                    MetaData(),
                    Column("id", Integer, primary_key=True),
                    Column("sources", JSON),
                    Column("partial", Integer),
                    Column("fetched_at", DateTime(timezone=True)),
                ),
            ),
        ):
            count = save_playlist_memberships(
                memberships, sources
            )

        self.assertEqual(count, 1)

        video_updates = [
            call.args[0]
            for call in session.execute.call_args_list
            if isinstance(call.args[0], Update)
            and getattr(
                call.args[0].table, "name", None
            ) == "music_videos"
        ]

        self.assertEqual(len(video_updates), 1)

        columns = {
            column.key
            for column in video_updates[0]._values
        }

        self.assertEqual(
            columns,
            {"categories", "playlist_ids"},
        )

        engine.dispose.assert_called_once()


if __name__ == "__main__":
    unittest.main()

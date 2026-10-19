"""Offline negative tests for the MV playlist catalog state."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, MetaData, Table
from sqlalchemy.sql.dml import Update

from mv_catalog import CatalogSource, SOURCES
from services.mv_playlist_writer import save_playlist_memberships


class PlaylistStateSafetyTests(unittest.TestCase):

    def inputs(self):
        memberships = {pid: set() for pid in SOURCES}
        sources = {
            pid: CatalogSource(
                id=pid,
                title=title,
                available=True,
                item_count=0,
            )
            for pid, (title, _) in SOURCES.items()
        }
        return memberships, sources

    def run_with_state(self, state_row):
        memberships, sources = self.inputs()

        session = MagicMock()
        result = MagicMock()
        result.one_or_none.return_value = state_row
        session.execute.return_value = result

        factory = MagicMock()
        factory.begin.return_value.__enter__.return_value = session

        engine = MagicMock()

        table = Table(
            "mv_catalog_state",
            MetaData(),
            Column("id", Integer, primary_key=True),
            Column("sources", JSON),
            Column("partial", Boolean),
            Column("fetched_at", DateTime(timezone=True)),
        )

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
                return_value=table,
            ),
        ):
            with self.assertRaises(RuntimeError):
                save_playlist_memberships(memberships, sources)

        writes = [
            c.args[0]
            for c in session.execute.call_args_list
            if isinstance(c.args[0], Update)
        ]
        self.assertEqual(writes, [])
        engine.dispose.assert_called_once()

    def test_partial_catalog_rejected(self):
        self.run_with_state(
            SimpleNamespace(sources=[], partial=True)
        )

    def test_missing_catalog_state_rejected(self):
        self.run_with_state(None)

    def test_invalid_sources_rejected(self):
        self.run_with_state(
            SimpleNamespace(sources={"wrong": "shape"}, partial=False)
        )


if __name__ == "__main__":
    unittest.main()

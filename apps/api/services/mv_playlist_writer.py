"""Atomically update MV playlist membership without overwriting metadata."""

import re
from datetime import datetime, timezone

from sqlalchemy import MetaData, Table, select, text, update
from sqlalchemy.dialects.postgresql import insert

from database.entities import MusicVideo
from database.session import create_db_engine, create_session_factory
from mv_catalog import CatalogSource, SOURCES, VERIFIED_CATEGORIES


def save_playlist_memberships(memberships, playlist_sources):
    """Apply fully validated official playlist memberships to PostgreSQL.

    Callers must verify playlist ownership and fetch all playlist pages first.
    No YouTube calls are performed here.
    """
    expected = set(SOURCES)
    if set(memberships) != expected or set(playlist_sources) != expected:
        raise ValueError("Incomplete playlist synchronization input")

    for pid in expected:
        ids = memberships[pid]
        item = playlist_sources[pid]

        if not isinstance(ids, (set, frozenset)):
            raise ValueError("Playlist members must be a set")

        if any(
            not isinstance(vid, str)
            or not re.fullmatch(r"[A-Za-z0-9_-]{11}", vid)
            for vid in ids
        ):
            raise ValueError("Invalid YouTube video ID")

        if (
            not isinstance(item, CatalogSource)
            or item.id != pid
            or not item.available
            or item.item_count != len(ids)
        ):
            raise ValueError("Invalid playlist source metadata")

    engine = create_db_engine()
    try:
        state = Table("mv_catalog_state", MetaData(), autoload_with=engine)
        factory = create_session_factory(engine)

        with factory.begin() as session:
            session.execute(text("SELECT pg_advisory_xact_lock(74120318)"))

            current = session.execute(
                select(state.c.sources, state.c.partial)
                .where(state.c.id == 1)
                .with_for_update()
            ).one_or_none()

            if current is None or current.partial is not False:
                raise RuntimeError("Complete MV catalog state required")

            current_sources = current.sources
            if (
                not isinstance(current_sources, list)
                or any(
                    not isinstance(item, dict)
                    or not isinstance(item.get("id"), str)
                    for item in current_sources
                )
            ):
                raise RuntimeError("Invalid stored MV catalog sources")

            videos = session.scalars(select(MusicVideo)).all()
            if not videos:
                raise RuntimeError("MV catalog is empty")

            changes = 0

            for video in videos:
                non_playlist = [
                    pid for pid in (video.playlist_ids or [])
                    if pid not in SOURCES
                ]

                official = [
                    pid for pid, ids in memberships.items()
                    if video.youtube_id in ids
                ]

                playlist_ids = list(dict.fromkeys(non_playlist + official))

                categories = list(dict.fromkeys(
                    SOURCES[pid][1]
                    for pid in official
                    if SOURCES[pid][1]
                ))

                if official:
                    for category in VERIFIED_CATEGORIES.get(
                        video.youtube_id, []
                    ):
                        if category not in categories:
                            categories.append(category)

                if not categories:
                    categories = ["unclassified"]

                if (
                    set(video.playlist_ids or []) != set(playlist_ids)
                    or set(video.categories or []) != set(categories)
                ):
                    session.execute(
                        update(MusicVideo)
                        .where(MusicVideo.youtube_id == video.youtube_id)
                        .values(
                            playlist_ids=playlist_ids,
                            categories=categories,
                        )
                    )
                    changes += 1

            merged = {
                source["id"]: source
                for source in current_sources
            }

            for pid, source in playlist_sources.items():
                merged[pid] = source.model_dump(mode="json")

            session.execute(
                update(state)
                .where(state.c.id == 1)
                .values(
                    sources=list(merged.values()),
                    fetched_at=datetime.now(timezone.utc),
                )
            )

        return changes
    finally:
        engine.dispose()

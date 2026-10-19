"""Atomically persist complete MV catalogs in PostgreSQL.

No YouTube API calls or SQLite writes.
"""

from sqlalchemy import MetaData, Table, select, text
from sqlalchemy.dialects.postgresql import insert

from database.entities import MusicVideo
from database.session import create_db_engine, create_session_factory
from mv_catalog import CatalogResponse


def save_catalog_to_db(catalog):
    if not isinstance(catalog, CatalogResponse):
        raise TypeError("Expected CatalogResponse")

    if catalog.partial or not catalog.videos:
        raise ValueError("Refusing partial or empty MV catalog")

    video_ids = [video.id for video in catalog.videos]
    if len(video_ids) != len(set(video_ids)):
        raise ValueError("Duplicate YouTube video IDs")

    engine = create_db_engine()
    try:
        state = Table(
            "mv_catalog_state",
            MetaData(),
            autoload_with=engine,
        )
        factory = create_session_factory(engine)

        with factory.begin() as session:
            # Serialize MV catalog writers across API processes.
            session.execute(
                text("SELECT pg_advisory_xact_lock(74120318)")
            )

            previous = session.execute(
                select(state.c.fetched_at)
                .where(state.c.id == 1)
                .with_for_update()
            ).scalar_one_or_none()

            if (
                previous is not None
                and catalog.fetched_at < previous
            ):
                raise RuntimeError(
                    "Refusing an older MV catalog snapshot"
                )

            existing_ids = set(
                session.scalars(
                    select(MusicVideo.youtube_id)
                ).all()
            )

            missing_ids = existing_ids - set(video_ids)

            if missing_ids:
                raise RuntimeError(
                    "Catalog omits existing PostgreSQL videos; "
                    "refusing to lose historical video coverage"
                )

            for video in catalog.videos:
                values = {
                    "youtube_id": video.id,
                    "title": video.title,
                    "channel_id": video.channel_id,
                    "channel_title": video.channel_title,
                    "published_at": video.published_at,
                    "thumbnail_url": video.thumbnail_url,
                    "categories": list(video.categories),
                    "playlist_ids": list(video.playlist_ids),
                    "aliases": list(video.aliases),
                    "view_count": video.view_count,
                    "like_count": video.like_count,
                }

                statement = insert(MusicVideo).values(**values)
                statement = statement.on_conflict_do_update(
                    index_elements=["youtube_id"],
                    set_={
                        key: value
                        for key, value in values.items()
                        if key != "youtube_id"
                    },
                )
                session.execute(statement)

            state_values = {
                "id": 1,
                "source": catalog.source,
                "fetched_at": catalog.fetched_at,
                "partial": False,
                "sources": [
                    source.model_dump(mode="json")
                    for source in catalog.sources
                ],
                "unavailable_video_ids": list(
                    catalog.unavailable_video_ids
                ),
            }

            statement = insert(state).values(**state_values)
            statement = statement.on_conflict_do_update(
                index_elements=["id"],
                set_={
                    key: value
                    for key, value in state_values.items()
                    if key != "id"
                },
            )
            session.execute(statement)

        return len(catalog.videos)
    finally:
        engine.dispose()

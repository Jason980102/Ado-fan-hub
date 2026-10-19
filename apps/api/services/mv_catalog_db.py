"""Read the complete MV catalog from PostgreSQL.

No SQLite reads, no YouTube API requests, no database writes.
"""

from sqlalchemy import select, text

from database.entities import MusicVideo
from database.session import create_db_engine, create_session_factory
from mv_catalog import CatalogResponse, CatalogVideo


def load_catalog_from_db():
    engine = create_db_engine()

    try:
        factory = create_session_factory(engine)

        with factory() as session:
            state = session.execute(text("""
                SELECT source, fetched_at, partial,
                       sources, unavailable_video_ids
                FROM mv_catalog_state
                WHERE id = 1
            """)).mappings().one_or_none()

            if state is None or state["partial"]:
                raise RuntimeError(
                    "Complete PostgreSQL MV catalog state required"
                )

            rows = session.scalars(
                select(MusicVideo).order_by(MusicVideo.youtube_id)
            ).all()

            videos = [
                CatalogVideo(
                    id=row.youtube_id,
                    title=row.title,
                    categories=row.categories,
                    published_at=row.published_at,
                    thumbnail_url=row.thumbnail_url,
                    view_count=row.view_count,
                    like_count=row.like_count,
                    url="https://www.youtube.com/watch?v=" + row.youtube_id,
                    channel_id=row.channel_id,
                    channel_title=row.channel_title or "",
                    playlist_ids=row.playlist_ids,
                    aliases=row.aliases,
                )
                for row in rows
            ]

        if not videos:
            raise RuntimeError("PostgreSQL MV catalog is empty")

        return CatalogResponse(
            source=state["source"],
            fetched_at=state["fetched_at"],
            cached=True,
            partial=False,
            sources=state["sources"],
            videos=videos,
            unavailable_video_ids=state["unavailable_video_ids"],
        )

    finally:
        engine.dispose()

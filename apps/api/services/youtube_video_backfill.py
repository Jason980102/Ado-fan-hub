"""Import the validated MV SQLite snapshot into PostgreSQL.

Offline only: no YouTube API requests.
"""

import re
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from database.entities import MusicVideo
from database.session import create_db_engine, create_session_factory
from mv_store import load_catalog
from news_sources.youtube import CHANNEL_ID


_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")


def build_rows(snapshot):
    if not snapshot or snapshot.get("partial") is not False:
        raise ValueError("A complete MV snapshot is required")

    videos = snapshot.get("videos")
    if not isinstance(videos, list) or not videos:
        raise ValueError("MV snapshot is empty")

    rows = []
    seen = set()

    for video in videos:
        video_id = video.get("id")
        title = video.get("title")
        channel_id = video.get("channel_id")
        channel_title = video.get("channel_title")
        raw_date = video.get("published_at")

        if (
            not isinstance(video_id, str)
            or not _VIDEO_ID.fullmatch(video_id)
            or video_id in seen
            or not isinstance(title, str)
            or not title.strip()
            or len(title) > 1000
            or not isinstance(channel_id, str)
            or len(channel_id) > 100
            or not isinstance(raw_date, str)
        ):
            raise ValueError("Invalid or duplicate MV metadata")

        seen.add(video_id)

        if channel_title is not None and (
            not isinstance(channel_title, str)
            or len(channel_title) > 300
        ):
            raise ValueError("Invalid channel title")

        date = datetime.fromisoformat(
            raw_date.replace("Z", "+00:00")
        )
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)

        thumbnail = video.get("thumbnail_url")
        if thumbnail is not None and not isinstance(thumbnail, str):
            raise ValueError("Invalid thumbnail")

        lists = {}
        for field in ("categories", "playlist_ids", "aliases"):
            value = video.get(field)
            if (
                not isinstance(value, list)
                or not all(isinstance(part, str) for part in value)
            ):
                raise ValueError("Invalid " + field)
            lists[field] = value

        counts = {}
        for field in ("view_count", "like_count"):
            value = video.get(field)
            if value is not None and (
                type(value) is not int or value < 0
            ):
                raise ValueError("Invalid " + field)
            counts[field] = value

        rows.append({
            "youtube_id": video_id,
            "title": title.strip(),
            "channel_id": channel_id,
            "channel_title": channel_title,
            "published_at": date,
            "thumbnail_url": thumbnail,
            **lists,
            **counts,
        })

    return rows


def backfill_videos():
    snapshot = load_catalog()
    rows = build_rows(snapshot)

    official = sum(
        row["channel_id"] == CHANNEL_ID for row in rows
    )

    if len(rows) != 775 or official != 753:
        raise RuntimeError("Snapshot differs from validated baseline")

    engine = create_db_engine()
    try:
        factory = create_session_factory(engine)

        with factory.begin() as session:
            existing = session.scalar(
                select(func.count()).select_from(MusicVideo)
            )

            if existing != 0:
                raise RuntimeError(
                    "music_videos is not empty; refusing initial backfill"
                )

            # Single PostgreSQL transaction: all-or-nothing.
            for row in rows:
                statement = insert(MusicVideo).values(**row)
                statement = statement.on_conflict_do_nothing(
                    index_elements=["youtube_id"]
                )
                session.execute(statement)

            inserted = session.scalar(
                select(func.count()).select_from(MusicVideo)
            )

            if inserted != 775:
                raise RuntimeError(
                    "Unexpected inserted count; rolling back"
                )

        return {
            "inserted": inserted,
            "official": official,
            "other_channels": len(rows) - official,
        }
    finally:
        engine.dispose()


if __name__ == "__main__":
    result = backfill_videos()
    print("=== MV POSTGRESQL BACKFILL ===")
    print("Inserted:", result["inserted"])
    print("Official Ado:", result["official"])
    print("Other channels:", result["other_channels"])
    print("PASS: MV catalog imported into PostgreSQL.")

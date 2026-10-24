"""Persistent analytics storage. No runtime schema creation or SQLite fallback."""
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from database.analytics_models import AnalyticsChannelSnapshot, AnalyticsVideoSnapshot
from database.session import create_db_engine

C = AnalyticsChannelSnapshot.__table__
V = AnalyticsVideoSnapshot.__table__


def timestamp(value):
    value = datetime.fromisoformat(value) if isinstance(value, str) else value
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError('Analytics timestamps require a timezone')
    return value.astimezone(timezone.utc)


def iso(value):
    return timestamp(value).isoformat()


def initialize_database():
    """Compatibility hook for sync callers; deploy schema with Alembic."""


def insert_snapshots(connection, table, rows):
    if not rows:
        return 0
    # Bounded batches stay below PostgreSQL parameter limits.
    count = 0
    for offset in range(0, len(rows), 500):
        result = connection.execute(insert(table).values(rows[offset:offset + 500])
                                    .on_conflict_do_nothing(index_elements=list(table.primary_key.columns)))
        count += result.rowcount
    return count


def save_channel_snapshot(analytics):
    channel = analytics.channel
    when = timestamp(analytics.fetched_at)
    engine = create_db_engine()
    try:
        with engine.begin() as connection:
            insert_snapshots(connection, C, [dict(
                channel_id=channel.id, fetched_at=when,
                subscriber_count=channel.subscriber_count,
                subscriber_count_is_approximate=channel.subscriber_count_is_approximate,
                view_count=channel.view_count, video_count=channel.video_count)])
            insert_snapshots(connection, V, [dict(
                channel_id=channel.id, video_id=video.id, fetched_at=when,
                title=video.title, thumbnail_url=video.thumbnail_url,
                view_count=video.view_count) for video in analytics.videos])
    finally:
        engine.dispose()


def read_channel_history(channel_id, since, limit=10000):
    engine = create_db_engine()
    try:
        with engine.connect() as connection:
            rows = connection.execute(select(C).where(
                C.c.channel_id == channel_id, C.c.fetched_at >= timestamp(since))
                .order_by(C.c.fetched_at.desc()).limit(limit)).mappings().all()
            return [dict(fetched_at=iso(row['fetched_at']),
                         subscriber_count=row['subscriber_count'],
                         subscriber_count_is_approximate=bool(row['subscriber_count_is_approximate']),
                         view_count=row['view_count'], video_count=row['video_count'])
                    for row in reversed(rows)]
    finally:
        engine.dispose()

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "analytics.sqlite3"


def _connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    connection = _connect()
    try:
        with connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS channel_snapshots (
                    channel_id TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    subscriber_count INTEGER,
                    subscriber_count_is_approximate INTEGER NOT NULL,
                    view_count INTEGER,
                    video_count INTEGER,
                    PRIMARY KEY (channel_id, fetched_at)
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS video_snapshots (
                    channel_id TEXT NOT NULL,
                    video_id TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    title TEXT NOT NULL,
                    thumbnail_url TEXT,
                    view_count INTEGER,
                    PRIMARY KEY (channel_id, fetched_at, video_id)
                )
            """)
    finally:
        connection.close()


def save_channel_snapshot(analytics):
    channel = analytics.channel
    connection = _connect()
    try:
        with connection:
            connection.execute(
                """
                INSERT INTO channel_snapshots (
                    channel_id,
                    fetched_at,
                    subscriber_count,
                    subscriber_count_is_approximate,
                    view_count,
                    video_count
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT (channel_id, fetched_at) DO NOTHING
                """,
                (
                    channel.id,
                    analytics.fetched_at.isoformat(),
                    channel.subscriber_count,
                    int(channel.subscriber_count_is_approximate),
                    channel.view_count,
                    channel.video_count,
                ),
            )
            connection.executemany(
                """INSERT INTO video_snapshots
                   (channel_id, video_id, fetched_at, title, thumbnail_url, view_count)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT (channel_id, fetched_at, video_id) DO NOTHING""",
                [(channel.id, video.id, analytics.fetched_at.isoformat(), video.title,
                  video.thumbnail_url, video.view_count) for video in analytics.videos],
            )
    finally:
        connection.close()

def read_channel_history(channel_id, since, limit=10000):
    initialize_database()
    connection = _connect()
    try:
        rows = connection.execute(
            """
            SELECT
                fetched_at,
                subscriber_count,
                subscriber_count_is_approximate,
                view_count,
                video_count
            FROM channel_snapshots
            WHERE channel_id = ? AND fetched_at >= ?
            ORDER BY fetched_at DESC
            LIMIT ?
            """,
            (channel_id, since, limit),
        ).fetchall()

        points = []
        for row in reversed(rows):
            point = dict(row)
            point["subscriber_count_is_approximate"] = bool(
                point["subscriber_count_is_approximate"]
            )
            points.append(point)

        return points
    finally:
        connection.close()

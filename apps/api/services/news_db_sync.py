"""Synchronize normalized public news into PostgreSQL."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert

from database.entities import NewsArticle, NewsSource
from database.session import create_db_engine, create_session_factory
from news_sources.fanclub import list_fanclub_history
from news_sources.wordpress import fetch_official_news_page
from news_sources.youtube import fetch_youtube_news


def _article_data(item, source_code):
    external_id = str(item.id)
    identity = source_code + ":" + external_id

    article_id = hashlib.sha256(
        identity.encode("utf-8")
    ).hexdigest()

    published = item.published_at
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)

    category = getattr(item.category, "value", item.category)

    # Do not persist fan-club article bodies or excerpts.
    summary = "" if source_code == "fanclub" else item.summary

    return {
        "id": article_id,
        "source_code": source_code,
        "external_id": external_id,
        "title": item.title,
        "summary": summary,
        "category": str(category),
        "language": item.language,
        "access_level": "public_metadata",
        "source_url": str(item.source_url),
        "image_url": str(item.image_url) if item.image_url else None,
        "published_at": published,
        "last_synced_at": datetime.now(timezone.utc),
    }


def sync_source(source_code, items):
    if source_code not in {"fanclub", "universal", "youtube"}:
        raise ValueError("Unsupported news source")

    rows = [_article_data(item, source_code) for item in items]

    if not rows:
        return 0

    # Remove repeated source IDs before the PostgreSQL upsert.
    unique = {row["external_id"]: row for row in rows}
    rows = list(unique.values())

    names = {
        "fanclub": "Ado Fan Club News",
        "universal": "UNIVERSAL MUSIC JAPAN",
        "youtube": "YouTube - Ado",
    }

    engine = create_db_engine()
    factory = create_session_factory(engine)

    try:
        with factory.begin() as session:
            source_statement = insert(NewsSource).values(
                code=source_code,
                display_name=names[source_code],
                is_active=True,
            )
            source_statement = source_statement.on_conflict_do_update(
                index_elements=["code"],
                set_={"display_name": names[source_code]},
            )
            session.execute(source_statement)

            for row in rows:
                statement = insert(NewsArticle).values(**row)
                statement = statement.on_conflict_do_update(
                    index_elements=["source_code", "external_id"],
                    set_={
                        key: value
                        for key, value in row.items()
                        if key not in {
                            "id", "source_code", "external_id"
                        }
                    },
                )
                session.execute(statement)

        return len(rows)
    finally:
        engine.dispose()


def sync_initial_news():
    # A deliberately small first batch.
    fanclub_items, _ = list_fanclub_history(0, 24)
    universal_items, _ = fetch_official_news_page(
        page=1, limit=20
    )
    youtube_items = fetch_youtube_news(limit=15)

    batches = (
        ("fanclub", fanclub_items),
        ("universal", universal_items),
        ("youtube", youtube_items),
    )

    for name, items in batches:
        count = sync_source(name, items)
        print("PASS:", name, "upserted", count, "articles")

"""Unified PostgreSQL search for All News and official Ado YouTube videos."""

from sqlalchemy import (
    func,
    literal,
    select,
    union_all,
)
from sqlalchemy.orm import aliased

from database.entities import MusicVideo, NewsArticle, NewsSource
from database.session import create_db_engine, create_session_factory
from models import NewsCategory, NewsItem, NewsListResponse
from news_sources.youtube import CHANNEL_ID


def _search_statement(category, query):
    article = NewsArticle
    source = NewsSource

    article_rows = select(
        article.external_id.label("external_id"),
        article.title.label("title"),
        article.summary.label("summary"),
        article.category.label("category"),
        source.display_name.label("source_name"),
        article.source_url.label("source_url"),
        article.published_at.label("published_at"),
        article.language.label("language"),
        article.image_url.label("image_url"),
    ).join(
        source, source.code == article.source_code
    ).where(
        source.is_active.is_(True)
    )

    existing_article = aliased(NewsArticle)

    mv_rows = select(
        (
            literal("youtube-") + MusicVideo.youtube_id
        ).label("external_id"),
        MusicVideo.title.label("title"),
        literal("").label("summary"),
        literal(NewsCategory.MEDIA.value).label("category"),
        source.display_name.label("source_name"),
        (
            literal("https://www.youtube.com/watch?v=")
            + MusicVideo.youtube_id
        ).label("source_url"),
        MusicVideo.published_at.label("published_at"),
        literal("ja").label("language"),
        MusicVideo.thumbnail_url.label("image_url"),
    ).join(
        source,
        source.code == literal("youtube"),
    ).where(
        source.is_active.is_(True),
        MusicVideo.channel_id == CHANNEL_ID,
        MusicVideo.published_at.is_not(None),
        ~select(existing_article.id).where(
            existing_article.source_code == "youtube",
            existing_article.external_id
            == literal("youtube-") + MusicVideo.youtube_id,
        ).exists(),
    )

    merged = union_all(article_rows, mv_rows).subquery()

    stmt = select(merged)

    if category is not None:
        stmt = stmt.where(merged.c.category == category.value)

    query = query.strip().casefold()

    if len(query) > 100:
        raise ValueError("Search query too long")

    if query:
        escaped = (
            query.replace("!", "!!")
            .replace("%", "!%")
            .replace("_", "!_")
        )
        stmt = stmt.where(
            merged.c.title.ilike("%" + escaped + "%", escape="!")
        )

    return stmt


def search_all_news(
    category: NewsCategory | None,
    limit: int,
    offset: int,
    query: str = "",
) -> NewsListResponse:
    """Return accurate merged count and globally paginated News results."""
    if not 1 <= limit <= 100 or offset < 0:
        raise ValueError("Invalid News pagination")

    statement = _search_statement(category, query)
    merged = statement.subquery()

    engine = create_db_engine()
    try:
        factory = create_session_factory(engine)

        with factory.begin() as session:
            if engine.dialect.name == "postgresql":
                from sqlalchemy import text
                session.execute(
                    text(
                        "SET TRANSACTION ISOLATION LEVEL "
                        "REPEATABLE READ, READ ONLY"
                    )
                )

            total = session.scalar(
                select(func.count()).select_from(merged)
            )

            rows = session.execute(
                select(merged)
                .order_by(
                    merged.c.published_at.desc(),
                    merged.c.external_id.desc(),
                )
                .offset(offset)
                .limit(limit)
            ).all()

            items = [
                NewsItem(
                    id=row.external_id,
                    title=row.title,
                    summary=(
                        ""
                        if row.source_name == "Ado Fan Club News"
                        else row.summary
                    ),
                    category=NewsCategory(row.category),
                    source_name=row.source_name,
                    source_url=row.source_url,
                    published_at=row.published_at,
                    language=row.language,
                    image_url=row.image_url,
                )
                for row in rows
            ]

            return NewsListResponse(items=items, total=total)
    finally:
        engine.dispose()

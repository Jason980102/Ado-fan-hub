"""Read-only PostgreSQL YouTube News + official MV catalog."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database.entities import MusicVideo, NewsArticle
from database.session import create_db_engine, create_session_factory
from models import NewsCategory, NewsItem, NewsListResponse
from news_sources.youtube import CHANNEL_ID

SOURCE_NAME = "YouTube - Ado"


def _news_video_id(external_id: str) -> str | None:
    prefix = "youtube-"
    if not external_id.startswith(prefix):
        return None
    return external_id[len(prefix):]



def _load_youtube_items() -> list[NewsItem]:
    """Load and deduplicate official YouTube News in one DB session."""
    engine = create_db_engine()

    try:
        factory = create_session_factory(engine)

        with factory() as session:
            articles = session.scalars(
                select(NewsArticle).where(
                    NewsArticle.source_code == "youtube"
                )
            ).all()

            videos = session.scalars(
                select(MusicVideo).where(
                    MusicVideo.channel_id == CHANNEL_ID
                )
            ).all()

        merged = {}

        for video in videos:
            if video.published_at is None:
                continue

            item = NewsItem(
                id=f"youtube-{video.youtube_id}",
                title=video.title,
                summary="",
                category=NewsCategory.MEDIA,
                source_name=SOURCE_NAME,
                source_url=(
                    "https://www.youtube.com/watch?v="
                    + video.youtube_id
                ),
                published_at=video.published_at,
                language="ja",
                image_url=video.thumbnail_url,
            )
            merged[video.youtube_id] = item

        for article in articles:
            vid = _news_video_id(article.external_id)
            if not vid:
                continue

            merged[vid] = NewsItem(
                id=article.external_id,
                title=article.title,
                summary=article.summary,
                category=NewsCategory(article.category),
                source_name=SOURCE_NAME,
                source_url=article.source_url,
                published_at=article.published_at,
                language=article.language,
                image_url=article.image_url,
            )

        items = list(merged.values())
        items.sort(
            key=lambda item: (item.published_at, item.id),
            reverse=True,
        )
        return items
    finally:
        engine.dispose()


def load_all_youtube_news() -> list[NewsItem]:
    """Return complete official YouTube history, newest first."""
    return _load_youtube_items()


def list_youtube_catalog(
    category: NewsCategory | None = None,
    limit: int = 20,
    offset: int = 0,
    query: str = "",
) -> NewsListResponse:
    """Search and paginate the unified official YouTube history."""
    if not 1 <= limit <= 100 or offset < 0:
        raise ValueError("Invalid pagination")

    query = query.strip().casefold()
    if len(query) > 100:
        raise ValueError("Search query too long")

    items = _load_youtube_items()

    if category is not None:
        items = [
            item for item in items
            if item.category == category
        ]

    if query:
        items = [
            item for item in items
            if query in item.title.casefold()
        ]

    return NewsListResponse(
        items=items[offset:offset + limit],
        total=len(items),
    )

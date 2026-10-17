from threading import Lock
from time import monotonic

from models import NewsCategory, NewsItem, NewsListResponse
from news_sources.wordpress import fetch_official_news


CACHE_TTL_SECONDS = 600
SOURCE_FETCH_LIMIT = 100

_cached_items: list[NewsItem] | None = None
_cache_expires_at = 0.0
_cache_lock = Lock()


def get_cached_news() -> list[NewsItem]:
    global _cached_items, _cache_expires_at

    with _cache_lock:
        now = monotonic()

        if _cached_items is not None and now < _cache_expires_at:
            return list(_cached_items)

        try:
            items = fetch_official_news(limit=SOURCE_FETCH_LIMIT)
            items.sort(
                key=lambda item: item.published_at,
                reverse=True,
            )
        except Exception:
            if _cached_items is not None:
                # Keep stale data and retry after 60 seconds.
                _cache_expires_at = monotonic() + 60
                return list(_cached_items)
            raise

        _cached_items = items
        _cache_expires_at = monotonic() + CACHE_TTL_SECONDS
        return list(_cached_items)


def list_cached_news(
    category: NewsCategory | None,
    limit: int,
    offset: int,
) -> NewsListResponse:
    items = get_cached_news()

    if category is not None:
        items = [
            item for item in items
            if item.category == category
        ]

    total = len(items)

    return NewsListResponse(
        items=items[offset:offset + limit],
        total=total,
    )

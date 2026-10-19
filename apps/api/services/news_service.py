from threading import Lock
from time import monotonic

from models import NewsCategory, NewsItem, NewsListResponse
from news_sources.wordpress import fetch_official_news, fetch_official_news_page
from news_sources.youtube import fetch_youtube_news
from news_sources.fanclub import fetch_fanclub_news, list_fanclub_history


CACHE_TTL_SECONDS = 60
SOURCE_FETCH_LIMIT = 100

_cached_items: list[NewsItem] | None = None
_cache_expires_at = 0.0
_cache_lock = Lock()


# Last successful snapshot for each source.
# Each fallback is retained for at most 30 minutes.
SOURCE_STALE_SECONDS = 1800
_source_snapshots = {}


def get_cached_news() -> list[NewsItem]:
    global _cached_items, _cache_expires_at

    with _cache_lock:
        now = monotonic()

        if _cached_items is not None and now < _cache_expires_at:
            return list(_cached_items)

        sources = (
            ("universal", lambda: fetch_official_news(limit=SOURCE_FETCH_LIMIT)),
            ("youtube", lambda: fetch_youtube_news(limit=15)),
            ("fanclub", lambda: fetch_fanclub_news(limit=60)),
        )

        items = []
        available_sources = 0

        for name, fetcher in sources:
            try:
                fresh_items = list(fetcher())
            except Exception:
                snapshot = _source_snapshots.get(name)
                if snapshot is None:
                    continue

                saved_at, saved_items = snapshot
                if now - saved_at > SOURCE_STALE_SECONDS:
                    continue

                items.extend(saved_items)
                available_sources += 1
            else:
                _source_snapshots[name] = (monotonic(), fresh_items)
                items.extend(fresh_items)
                available_sources += 1

        if available_sources == 0:
            raise RuntimeError("All news sources unavailable")

        unique = {item.id: item for item in items}
        merged = sorted(
            unique.values(),
            key=lambda item: item.published_at,
            reverse=True,
        )

        _cached_items = merged
        _cache_expires_at = monotonic() + CACHE_TTL_SECONDS
        return list(_cached_items)


NEWS_SOURCE_NAMES = {
    "x_staff": "X - Ado Staff",
    "x_ado": "X - Ado",
    "x_fanclub": "X - Ado Fan Club",
    "instagram": "Instagram - Ado",
    "fanclub": "Ado Fan Club News",
    "fanclub_shop": "Ado Fan Club Shop",
    "official_shop": "Ado Official Shop",
    "youtube": "YouTube - Ado",
    "universal": "UNIVERSAL MUSIC JAPAN",
}



# Initial bounded search coverage. A full historical index will
# replace these windows without changing the public search API.
SEARCH_FANCLUB_LIMIT = 180
SEARCH_UNIVERSAL_LIMIT = 200


def _search_history_window(loader, maximum):
    items = []
    offset = 0

    while offset < maximum:
        count = min(100, maximum - offset)
        batch, total = loader(offset, count)
        items.extend(batch)

        if len(batch) < count or offset + count >= total:
            break

        offset += count

    return items


def search_news_titles(
    category: NewsCategory | None,
    limit: int,
    offset: int,
    source: str,
    query: str,
) -> NewsListResponse:
    if source not in ("all", "x") and source not in NEWS_SOURCE_NAMES:
        raise ValueError("Unsupported news source")

    query = query.strip().casefold()

    if len(query) > 100:
        raise ValueError("Search query too long")

    # Search only synchronized records; never scan live upstream histories.
    from sqlalchemy import func, select
    from database.entities import NewsArticle, NewsSource
    from database.session import create_db_engine, create_session_factory

    engine = create_db_engine()
    try:
        factory = create_session_factory(engine)
        with factory.begin() as session:
            # Count and page share one PostgreSQL snapshot.
            if engine.dialect.name == "postgresql":
                from sqlalchemy import text
                session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
            conditions = [NewsSource.is_active.is_(True)]
            if query:
                escaped_query = (
                    query.replace("!", "!!")
                    .replace("%", "!%")
                    .replace("_", "!_")
                )
                conditions.append(
                    NewsArticle.title.ilike(
                        "%" + escaped_query + "%",
                        escape="!",
                    )
                )
            if source == "x":
                conditions.append(NewsArticle.source_code.in_(("x_staff", "x_ado", "x_fanclub")))
            elif source != "all":
                conditions.append(NewsArticle.source_code == source)
            if category is not None:
                conditions.append(NewsArticle.category == category.value)
            joined = select(NewsArticle, NewsSource.display_name).join(
                NewsSource, NewsSource.code == NewsArticle.source_code
            ).where(*conditions)
            total = session.scalar(select(func.count()).select_from(joined.subquery()))
            rows = session.execute(joined.order_by(
                NewsArticle.published_at.desc(), NewsArticle.id.desc()
            ).offset(offset).limit(limit)).all()
            items = [NewsItem(
                id=row.external_id, title=row.title,
                summary="" if row.source_code == "fanclub" else row.summary,
                category=row.category, source_name=name, source_url=row.source_url,
                published_at=row.published_at, language=row.language,
                image_url=row.image_url,
            ) for row, name in rows]
            return NewsListResponse(items=items, total=total)
    finally:
        engine.dispose()



def list_cached_news(
    category: NewsCategory | None,
    limit: int,
    offset: int,
    source: str = "all",
) -> NewsListResponse:
    if source not in ("all", "x") and source not in NEWS_SOURCE_NAMES:
        raise ValueError("Unsupported news source")

    if source == "all" and category is None:
        items, total = list_all_news_history(offset, limit)
        return NewsListResponse(items=items, total=total)

    if source == "universal" and category is None:
        items, total = list_universal_history(offset, limit)
        return NewsListResponse(items=items, total=total)

    if source == "fanclub":
        items, total = list_fanclub_history(offset, limit)
        if category is not None:
            items = [item for item in items if item.category == category]
        return NewsListResponse(items=items, total=total)

    items = get_cached_news()

    if source == "x":
        x_names = {
            NEWS_SOURCE_NAMES["x_staff"],
            NEWS_SOURCE_NAMES["x_ado"],
            NEWS_SOURCE_NAMES["x_fanclub"],
        }
        items = [item for item in items if item.source_name in x_names]
    elif source != "all":
        expected_name = NEWS_SOURCE_NAMES[source]
        items = [item for item in items if item.source_name == expected_name]

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

# Lazy WordPress history cache. Keep fetched pages across requests.
_universal_history_lock = Lock()
_universal_history_items = []
_universal_history_total = None
_universal_history_page = 1
_universal_history_expires_at = 0.0
UNIVERSAL_HISTORY_TTL_SECONDS = 600


def list_universal_history(offset: int, limit: int):
    global _universal_history_items, _universal_history_total
    global _universal_history_page, _universal_history_expires_at

    if offset < 0 or not 1 <= limit <= 100:
        raise ValueError("Invalid Universal history pagination")

    with _universal_history_lock:
        now = monotonic()

        # Refresh the first page atomically, leaving existing data intact
        # if the upstream request fails.
        if offset == 0 and now >= _universal_history_expires_at:
            try:
                first, total = fetch_official_news_page(page=1, limit=100)
                if not first:
                    raise ValueError("Empty Universal history")
            except Exception:
                if not _universal_history_items:
                    raise
            else:
                _universal_history_items = list(first)
                _universal_history_total = total
                _universal_history_page = 2
                _universal_history_expires_at = (
                    monotonic() + UNIVERSAL_HISTORY_TTL_SECONDS
                )

        needed = offset + limit
        while (
            len(_universal_history_items) < needed
            and _universal_history_total is not None
            and (_universal_history_page - 1) * 100
            < _universal_history_total
        ):
            page = _universal_history_page
            batch, total = fetch_official_news_page(page=page, limit=100)

            if not batch:
                raise ValueError("Unexpected empty Universal history page")

            existing = {item.id for item in _universal_history_items}
            _universal_history_items.extend(
                item for item in batch if item.id not in existing
            )
            _universal_history_items.sort(
                key=lambda item: (item.published_at, item.id),
                reverse=True,
            )
            _universal_history_total = total
            _universal_history_page = page + 1

        if _universal_history_total is None:
            raise ValueError("Universal history unavailable")

        return (
            list(_universal_history_items[offset:offset + limit]),
            _universal_history_total,
        )

# All News merges incrementally loaded source histories.
# The loaded window remains stable while the user scrolls.
_all_history_lock = Lock()
_all_history_sources = None
_all_history_totals = None
_all_history_expires_at = 0.0
ALL_HISTORY_TTL_SECONDS = 600


def _all_sorted_items(sources):
    unique = {
        item.id: item
        for batch in sources.values()
        for item in batch
    }
    return sorted(
        unique.values(),
        key=lambda item: (item.published_at, item.id),
        reverse=True,
    )


def _all_initialize():
    # Reuse the existing resilient aggregator for YouTube metadata.
    recent = get_cached_news()
    youtube = [
        item for item in recent
        if item.source_name == NEWS_SOURCE_NAMES["youtube"]
    ]

    fanclub, fanclub_total = list_fanclub_history(0, 60)
    universal, universal_total = list_universal_history(0, 100)

    sources = {
        "fanclub": fanclub,
        "universal": universal,
        "youtube": youtube,
    }
    totals = {
        "fanclub": fanclub_total,
        "universal": universal_total,
        "youtube": len(youtube),
    }
    return sources, totals


def _all_extend_source(sources, totals, name):
    previous = sources[name]
    offset = len(previous)

    if name == "fanclub":
        batch, total = list_fanclub_history(offset, 60)
    elif name == "universal":
        batch, total = list_universal_history(offset, 100)
    else:
        return False

    seen = {item.id for item in previous}
    additions = [item for item in batch if item.id not in seen]

    if not additions:
        # Avoid an infinite retry loop if upstream data is malformed.
        raise ValueError("News history made no pagination progress")

    sources[name] = previous + additions
    sources[name].sort(
        key=lambda item: (item.published_at, item.id),
        reverse=True,
    )
    totals[name] = total
    return True


def list_all_news_history(offset: int, limit: int):
    global _all_history_sources, _all_history_totals
    global _all_history_expires_at

    if offset < 0 or not 1 <= limit <= 100:
        raise ValueError("Invalid All News pagination")

    with _all_history_lock:
        now = monotonic()

        # Never replace a browsing window during a load-more request.
        if (
            _all_history_sources is None
            or (offset == 0 and now >= _all_history_expires_at)
        ):
            try:
                sources, totals = _all_initialize()
            except Exception:
                if _all_history_sources is None:
                    # Preserve the existing resilient News behavior.
                    recent = get_cached_news()
                    return recent[offset:offset + limit], len(recent)
            else:
                _all_history_sources = sources
                _all_history_totals = totals
                _all_history_expires_at = (
                    monotonic() + ALL_HISTORY_TTL_SECONDS
                )

        sources = _all_history_sources
        totals = _all_history_totals
        needed = offset + limit

        while True:
            merged = _all_sorted_items(sources)
            expandable = [
                name for name in ("fanclub", "universal")
                if len(sources[name]) < totals[name]
            ]

            if not expandable:
                break

            # All not-yet-fetched posts are at most as recent as
            # the oldest fetched post in their respective source.
            if len(merged) >= needed:
                boundary = merged[needed - 1].published_at
                unsafe = [
                    name for name in expandable
                    if not sources[name]
                    or sources[name][-1].published_at >= boundary
                ]
                if not unsafe:
                    break
            else:
                unsafe = expandable

            # Extend the source with the most recent unknown frontier.
            name = max(
                unsafe,
                key=lambda candidate: (
                    sources[candidate][-1].published_at
                    if sources[candidate] else merged[0].published_at
                ),
            )
            _all_extend_source(sources, totals, name)

        merged = _all_sorted_items(sources)

        # Raw source totals are an upper estimate until all posts
        # have been normalized and deduplicated.
        total = sum(totals.values())
        if (
            len(sources["fanclub"]) >= totals["fanclub"]
            and len(sources["universal"]) >= totals["universal"]
        ):
            total = len(merged)

        return merged[offset:offset + limit], total

"""Public news listing from the official Ado fan club website.

Only publicly listed metadata is used. No login, cookies, tokens,
or member-restricted article contents are requested.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json
from threading import Lock
from time import monotonic
import re

from models import NewsCategory, NewsItem


API_URL = (
    "https://api.ado-dokidokihimitsukichi-daigakuimo.com"
    "/fc/fanclub_sites/95/article_themes/news/articles"
)
SITE_URL = "https://ado-dokidokihimitsukichi-daigakuimo.com/"
SOURCE_NAME = "Ado Fan Club News"
JST = timezone(timedelta(hours=9))


def _find_articles(value):
    """Find listed article objects without assuming pagination wrappers."""
    if isinstance(value, dict):
        if (
            isinstance(value.get("id"), int)
            and isinstance(value.get("article_title"), str)
            and isinstance(value.get("publish_at"), str)
        ):
            return [value]

        results = []
        for child in value.values():
            if isinstance(child, (dict, list)):
                results.extend(_find_articles(child))
        return results

    if isinstance(value, list):
        results = []
        for child in value:
            results.extend(_find_articles(child))
        return results

    return []


def parse_fanclub_news(data, limit=60):
    if not isinstance(data, dict):
        raise ValueError("Unexpected fan club response")

    payload = data.get("data")
    if not isinstance(payload, dict):
        raise ValueError("Missing fan club data")

    theme = payload.get("article_theme")
    if not isinstance(theme, dict):
        raise ValueError("Missing fan club article theme")

    articles = theme.get("articles")
    if not isinstance(articles, (dict, list)):
        raise ValueError("Missing fan club articles")

    results = []

    for article in _find_articles(articles):
        try:
            published_at = datetime.fromisoformat(
                article["publish_at"].strip().replace(" ", "T")
            )
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=JST)

            title = article["article_title"].strip()
            article_id = article["id"]
            article_code = article.get("article_code")
            if not isinstance(article_code, str) or not re.fullmatch(
                r"[A-Za-z0-9]+", article_code
            ):
                continue

            if not title or article_id <= 0:
                continue

            image_url = article.get("thumbnail_url")
            if not isinstance(image_url, str) or not image_url.startswith(
                "https://"
            ):
                image_url = None

            authorization = article.get("article_authorization_type")
            status = article.get("article_status")
            is_public = (
                isinstance(authorization, dict)
                and authorization.get("authorization_name") == "\u5168\u30e6\u30fc\u30b6\u30fc"
                and isinstance(status, dict)
                and status.get("id") == 3
                and article.get("particial_access") is False
            )

            summary = ""
            if is_public:
                raw_content = article.get("contents")
                if isinstance(raw_content, str):
                    cleaned = re.sub(r"\s+", " ", raw_content).strip()
                    if len(cleaned) <= 180:
                        summary = cleaned
                    else:
                        excerpt = cleaned[:180]
                        endings = list(re.finditer(r"[\u3002\uff01\uff1f.!?]", excerpt))
                        usable = [
                            match.end() for match in endings
                            if match.end() >= 90
                        ]
                        if usable:
                            summary = excerpt[:usable[-1]].strip()
                        else:
                            summary = excerpt.rstrip() + "\u2026"

            results.append(
                NewsItem(
                    id=f"fanclub-{article_id}",
                    title=title,
                    summary=summary,
                    category=NewsCategory.OFFICIAL,
                    source_name=SOURCE_NAME,
                    source_url=f"{SITE_URL}articles/news/{article_code}",
                    published_at=published_at,
                    language="ja",
                    image_url=image_url,
                )
            )
        except (TypeError, ValueError, KeyError):
            continue

    unique = {item.id: item for item in results}
    return sorted(
        unique.values(),
        key=lambda item: item.published_at,
        reverse=True,
    )[:limit]


# Incremental, source-specific history cache.
# The source provides six articles per page and a total count.
FANCLUB_CACHE_SECONDS = 600
FANCLUB_PAGE_SIZE = 6

_fanclub_cache = []
_fanclub_total = None
_fanclub_next_page = 1
_fanclub_exhausted = False
_fanclub_cache_expiry = 0.0
_fanclub_cache_lock = Lock()


def _fetch_fanclub_page(page):
    query = urlencode({
        "per_page": FANCLUB_PAGE_SIZE,
        "page": page,
        "sort": "published_at_desc",
    })
    request = Request(
        API_URL + "?" + query,
        headers={
            "User-Agent": "AdoFanHub/1.0",
            "Accept": "application/json",
            "fc_site_id": "95",
            "fc_use_device": "null",
        },
    )

    with urlopen(request, timeout=12) as response:
        if "json" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("Unexpected fan club content type")
        raw = response.read(500001)

    if len(raw) > 500000:
        raise ValueError("Fan club response too large")

    data = json.loads(raw)
    articles = data["data"]["article_theme"]["articles"]
    if not isinstance(articles, dict):
        raise ValueError("Invalid fan club pagination response")

    entries = articles.get("list")
    total = articles.get("total")
    if not isinstance(entries, list) or type(total) is not int or total < 0:
        raise ValueError("Invalid fan club pagination metadata")

    normalized = parse_fanclub_news(data, limit=FANCLUB_PAGE_SIZE)
    return normalized, len(entries), total


def _ensure_fanclub_history(required, refresh=False):
    global _fanclub_cache, _fanclub_total, _fanclub_next_page
    global _fanclub_exhausted, _fanclub_cache_expiry

    now = monotonic()

    # Refresh only at the beginning of a browsing session.
    # Retain the existing list during deep scrolling to avoid resetting offsets.
    if refresh and now >= _fanclub_cache_expiry:
        _fanclub_cache = []
        _fanclub_total = None
        _fanclub_next_page = 1
        _fanclub_exhausted = False

    if required <= len(_fanclub_cache) and _fanclub_total is not None:
        return

    seen = {item.id for item in _fanclub_cache}
    while len(_fanclub_cache) < required and not _fanclub_exhausted:
        page = _fanclub_next_page
        items, raw_count, total = _fetch_fanclub_page(page)
        _fanclub_total = total
        _fanclub_next_page = page + 1

        for item in items:
            if item.id not in seen:
                _fanclub_cache.append(item)
                seen.add(item.id)

        if (
            raw_count < FANCLUB_PAGE_SIZE
            or page * FANCLUB_PAGE_SIZE >= total
        ):
            _fanclub_exhausted = True

    if _fanclub_exhausted:
        _fanclub_total = len(_fanclub_cache)

    _fanclub_cache.sort(
        key=lambda item: (item.published_at, item.id),
        reverse=True,
    )
    _fanclub_cache_expiry = monotonic() + FANCLUB_CACHE_SECONDS


def fetch_fanclub_news(limit=60):
    """Return recent news for the existing multi-source aggregator."""
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")

    with _fanclub_cache_lock:
        try:
            _ensure_fanclub_history(max(60, limit), refresh=True)
        except Exception:
            if not _fanclub_cache:
                raise
        return list(_fanclub_cache[:limit])


def list_fanclub_history(offset, limit):
    """Return a lazy history window and the upstream source total."""
    if offset < 0 or not 1 <= limit <= 100:
        raise ValueError("Invalid fan club history pagination")

    with _fanclub_cache_lock:
        # Only a request for the first page may refresh the snapshot.
        # Later offsets continue using the same in-memory history.
        _ensure_fanclub_history(
            offset + limit,
            refresh=(offset == 0),
        )

        total = _fanclub_total
        if total is None:
            raise ValueError("Fan club total unavailable")

        return list(_fanclub_cache[offset:offset + limit]), total


def fetch_fanclub_raw_batch(offset, limit=24):
    """Read raw source positions directly, without replaying the UI cache."""
    if offset < 0 or offset % FANCLUB_PAGE_SIZE or not 1 <= limit <= 100 or limit % FANCLUB_PAGE_SIZE:
        raise ValueError("Fan club worker offsets and limits must be page-aligned")
    items = []
    consumed = 0
    total = None
    for page in range(offset // FANCLUB_PAGE_SIZE + 1,
                      (offset + limit) // FANCLUB_PAGE_SIZE + 1):
        batch, raw_count, page_total = _fetch_fanclub_page(page)
        if total is not None and total != page_total:
            raise ValueError("Fan club total changed during batch; retry")
        total = page_total
        expected = min(FANCLUB_PAGE_SIZE, max(0, total - (page - 1) * FANCLUB_PAGE_SIZE))
        if raw_count != expected or len(batch) != raw_count:
            raise ValueError("Incomplete or unparseable fan club page; checkpoint preserved")
        items.extend(batch)
        consumed += raw_count
        if raw_count < FANCLUB_PAGE_SIZE or offset + consumed >= total:
            break
    return items, total, offset + consumed

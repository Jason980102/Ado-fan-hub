from datetime import datetime
from hashlib import sha256
from urllib.parse import urlsplit, urlunsplit

from models import NewsCategory, NewsItem


SOURCE_NAME = "UNIVERSAL MUSIC JAPAN"
OFFICIAL_HOST = "www.universal-music.co.jp"
NEWS_PATH = "/ado/news/"


def normalize_official_news(
    title: str,
    summary: str,
    source_url: str,
    published_at: datetime,
    category: NewsCategory = NewsCategory.OFFICIAL,
    image_url: str | None = None,
) -> NewsItem:
    """Normalize manually verified official news metadata."""

    if published_at.tzinfo is None or published_at.utcoffset() is None:
        raise ValueError("published_at must include timezone information")

    if not title.strip():
        raise ValueError("News title cannot be empty")

    parsed = urlsplit(source_url.strip())

    if (
        parsed.scheme != "https"
        or parsed.netloc != OFFICIAL_HOST
        or not parsed.path.startswith(NEWS_PATH)
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("Invalid official Ado news URL")

    normalized_url = urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, "", "")
    )

    news_id = sha256(normalized_url.encode("utf-8")).hexdigest()[:16]

    return NewsItem(
        id=f"umj-{news_id}",
        title=title.strip(),
        summary=summary.strip(),
        category=category,
        source_name=SOURCE_NAME,
        source_url=normalized_url,
        published_at=published_at,
        language="ja",
        image_url=image_url,
    )
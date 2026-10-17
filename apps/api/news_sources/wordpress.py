import json
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.request import Request, urlopen

from models import NewsCategory, NewsItem
from news_sources.universal_music import normalize_official_news
from urllib.parse import urljoin, urlsplit

API_URL = (
    "https://www.universal-music.co.jp/ado/"
    "wp-json/wp/v2/posts"
)

CATEGORY_MAP = {
    1: NewsCategory.OFFICIAL,
    10: NewsCategory.CONCERT,
    2: NewsCategory.MEDIA,
    3: NewsCategory.MEDIA,
    4: NewsCategory.MEDIA,
    5: NewsCategory.MEDIA,
    6: NewsCategory.MEDIA,
    7: NewsCategory.OFFICIAL,
    8: NewsCategory.OFFICIAL,
    9: NewsCategory.OFFICIAL,
}


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []

    def handle_data(self, data):
        self.parts.append(data)




class ImageExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return

        attributes = dict(attrs)
        source = attributes.get("src") or attributes.get("data-src")

        if source:
            self.images.append(source)


def extract_first_image(html: str) -> str | None:
    parser = ImageExtractor()
    parser.feed(html)

    for source in parser.images:
        url = urljoin("https://www.universal-music.co.jp", source)
        parsed = urlsplit(url)

        if (
            parsed.scheme == "https"
            and parsed.hostname == "www.universal-music.co.jp"
            and parsed.username is None
            and parsed.password is None
            and parsed.port is None
            and parsed.path.startswith("/ado/wp-content/uploads/")
        ):
            return url

    return None

def clean_html(value: str) -> str:
    parser = TextExtractor()
    parser.feed(value)
    return " ".join(
        unescape("".join(parser.parts)).split()
    )


def parse_post(post: dict) -> NewsItem:
    date_gmt = post["date_gmt"]

    published_at = datetime.fromisoformat(
        date_gmt.replace("Z", "+00:00")
    )

    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)

    category_ids = post.get("categories", [])

    if 10 in category_ids:
        category = NewsCategory.CONCERT
    elif any(
        CATEGORY_MAP.get(category_id) == NewsCategory.MEDIA
        for category_id in category_ids
    ):
        category = NewsCategory.MEDIA
    else:
        category = NewsCategory.OFFICIAL

    return normalize_official_news(
    title=clean_html(post["title"]["rendered"]),
    summary=clean_html(post.get("excerpt", {}).get("rendered", "")),
    source_url=post["link"],
    published_at=published_at,
    category=category,
    image_url=extract_first_image(
        post.get("content", {}).get("rendered", "")
    ),
)


def fetch_official_news(limit: int = 10) -> list[NewsItem]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")

    query = (
        f"?per_page={limit}"
        "&_fields=id,date_gmt,link,title,excerpt,categories,content"
    )

    request = Request(
        API_URL + query,
        headers={
            "User-Agent": "AdoFanHubResearch/0.1",
            "Accept": "application/json",
        },
    )

    with urlopen(request, timeout=15) as response:
        posts = json.load(response)

    if not isinstance(posts, list):
        raise ValueError("Unexpected WordPress API response")

    return [parse_post(post) for post in posts]

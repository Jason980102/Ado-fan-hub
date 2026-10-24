"""Public Ado YouTube uploads via the official Atom feed."""

from datetime import datetime
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from models import NewsCategory, NewsItem


CHANNEL_ID = "UCln9P4Qm3-EAY4aiEPmRwEA"
FEED_URL = (
    "https://www.youtube.com/feeds/videos.xml?channel_id="
    + CHANNEL_ID
)

ATOM = "{http://www.w3.org/2005/Atom}"
YT = "{http://www.youtube.com/xml/schemas/2015}"
MEDIA = "{http://search.yahoo.com/mrss/}"


def parse_youtube_feed(data: bytes, limit: int = 15) -> list[NewsItem]:
    root = ET.fromstring(data)
    channel = root.find(f"{YT}channelId")

    # Some YouTube feeds omit the UC prefix in their channel metadata.
    accepted_ids = {CHANNEL_ID, CHANNEL_ID[2:]}
    feed_id = root.findtext(f"{ATOM}id")
    if (
        channel is None
        or channel.text not in accepted_ids
        or feed_id != f"yt:channel:{channel.text}"
    ):
        raise ValueError("Unexpected YouTube channel")

    results = []

    for entry in root.findall(f"{ATOM}entry")[:limit]:
        video_id = entry.findtext(f"{YT}videoId")
        title = entry.findtext(f"{ATOM}title")
        published = entry.findtext(f"{ATOM}published")

        if not video_id or not title or not published:
            continue

        published_at = datetime.fromisoformat(
            published.replace("Z", "+00:00")
        )

        media_group = entry.find(f"{MEDIA}group")
        description = ""
        image_url = None

        if media_group is not None:
            description = (
                media_group.findtext(f"{MEDIA}description") or ""
            )
            thumbnail = media_group.find(f"{MEDIA}thumbnail")
            if thumbnail is not None:
                image_url = thumbnail.attrib.get("url")

        results.append(
            NewsItem(
                id=f"youtube-{video_id}",
                title=title.strip(),
                summary=description.strip()[:500],
                category=NewsCategory.MEDIA,
                source_name="YouTube - Ado",
                source_url=f"https://www.youtube.com/watch?v={video_id}",
                published_at=published_at,
                language="ja",
                image_url=image_url,
            )
        )

    return results


def fetch_youtube_news(limit: int = 15) -> list[NewsItem]:
    if not 1 <= limit <= 15:
        raise ValueError("limit must be between 1 and 15")

    request = Request(
        FEED_URL,
        headers={
            "User-Agent": "AdoFanHub/1.0",
            "Accept": "application/atom+xml",
        },
    )

    with urlopen(request, timeout=12) as response:
        data = response.read(2_000_001)

    if len(data) > 2_000_000:
        raise ValueError("YouTube feed too large")

    return parse_youtube_feed(data, limit)

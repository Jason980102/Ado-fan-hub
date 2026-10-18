"""Playlist-backed discovery catalog; deliberately separate from Analytics snapshots."""
import time
import logging
import sqlite3
from datetime import datetime, timezone
import re
from threading import Lock
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from mv_store import load_catalog, save_catalog
from analytics import _configuration, _number, _playlist_video_ids, _youtube

router = APIRouter(prefix='/api/mv', tags=['MV catalog'])
Category = Literal['original', 'cover', 'live', 'collaboration', 'other', 'unclassified']
# Verified with playlists.list on 2026-10-18, all owned by the configured Ado channel.
SOURCES = {
    'PLaxauk3chSWgwI1W0yo5Bv9GAn1O1cwKB': ('Original', 'original'),
    'PLaxauk3chSWjJUBirUlCQH9fOgvfiNjcc': ('歌いました', 'cover'),
    'PLaxauk3chSWj6Lg0HZtQ8mhTeGRyopOl5': ('LIVE', 'live'),
    'PLaxauk3chSWizBh8KxPj83Ue03qy0A_Xv': ('Remix', 'other'),
    'PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j': ('出張', None),
}
# Human-reviewed publisher metadata, not keyword classification. Only applies if
# the ID is still a member of an approved playlist. No view counts are stored here.
VERIFIED_CATEGORIES = {
    '5Duje_sZko8': ['collaboration'],  # Imagine Dragons: Take Me To The Beach feat. Ado
    'vMddOrUGwDw': ['collaboration'],  # HYBE: UNFORGIVEN; description credits Ado vocals
    'x0zfQrIj_Ho': ['cover', 'collaboration'],  # mahiru: description credits mahiru x ado
}
EXCLUDED_IDS = {
    'r-IIISSOhik',  # Cloud Nine anniversary program, not a music performance
    '8BU6LMzMquU',  # Vocal coaching program
}


class CatalogSource(BaseModel):
    id: str
    title: str
    available: bool
    item_count: int | None = None


class CatalogVideo(BaseModel):
    id: str
    title: str
    categories: list[Category]
    published_at: datetime
    thumbnail_url: str | None
    view_count: int | None
    like_count: int | None
    url: str
    channel_id: str
    channel_title: str
    playlist_ids: list[str]
    aliases: list[str]


class CatalogResponse(BaseModel):
    source: str = 'YouTube Data API v3 · Ado uploads and official playlists'
    fetched_at: datetime
    cached: bool = False
    partial: bool = False
    sources: list[CatalogSource]
    videos: list[CatalogVideo]
    unavailable_video_ids: list[str]


def _video(item, playlist_ids):
    snippet = item.get('snippet', {})
    status = item.get('status', {})
    if (status.get('privacyStatus') != 'public'
            or status.get('uploadStatus') != 'processed'
            or not snippet.get('title') or not snippet.get('channelId')
            or not snippet.get('publishedAt')):
        return None
    categories = list(dict.fromkeys(
        SOURCES[pid][1] for pid in playlist_ids if pid in SOURCES and SOURCES[pid][1]
    ))
    for category in VERIFIED_CATEGORIES.get(item['id'], []):
        if category not in categories:
            categories.append(category)
    if not categories:
        categories = ['unclassified']
    thumbnail = next((snippet.get('thumbnails', {}).get(size, {}).get('url')
                      for size in ('high', 'medium', 'default')
                      if snippet.get('thumbnails', {}).get(size, {}).get('url')), None)
    if not isinstance(thumbnail, str) or not thumbnail.startswith('https://i.ytimg.com/'):
        thumbnail = None
    # Only publisher-provided localized titles. No generated translations/romaji.
    aliases = list(dict.fromkeys(
        loc['title'].strip() for loc in item.get('localizations', {}).values()
        if isinstance(loc, dict) and isinstance(loc.get('title'), str) and loc['title'].strip()
    ))[:100]
    return CatalogVideo(
        id=item['id'], title=snippet['title'], categories=categories,
        published_at=snippet['publishedAt'], thumbnail_url=thumbnail,
        view_count=_number(item.get('statistics', {}), 'viewCount'),
        like_count=_number(item.get('statistics', {}), 'likeCount'),
        url='https://www.youtube.com/watch?v=' + item['id'],
        channel_id=snippet['channelId'], channel_title=snippet.get('channelTitle', ''),
        playlist_ids=playlist_ids, aliases=aliases,
    )


def _recent_feed_video_ids(channel_id):
    """Read the official channel's latest public feed."""
    import re

    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id):
        raise ValueError("Invalid channel ID")

    request = Request(
        "https://www.youtube.com/feeds/videos.xml?channel_id="
        + channel_id,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/atom+xml",
        },
    )

    with urlopen(request, timeout=15) as response:
        content = response.read(512001)

    if len(content) > 512000:
        raise ValueError("Feed too large")

    document = ET.fromstring(content)

    atom = "{http://www.w3.org/2005/Atom}"
    yt = "{http://www.youtube.com/xml/schemas/2015}"

    feed_channel_id = document.findtext(yt + "channelId")

    if feed_channel_id not in (channel_id, channel_id[2:]):
        raise ValueError("Feed channel mismatch")

    ids = []
    seen = set()

    for entry in document.findall(atom + "entry"):
        vid = entry.findtext(yt + "videoId")

        if entry.findtext(yt + "channelId") != channel_id:
            continue

        if (
            isinstance(vid, str)
            and re.fullmatch(r"[A-Za-z0-9_-]{11}", vid)
            and vid not in seen
        ):
            seen.add(vid)
            ids.append(vid)

    return ids


def _confirmed_short(item):
    """Conservative Shorts detection from explicit title tags."""
    import re

    title = item.get("snippet", {}).get("title", "")

    if not isinstance(title, str):
        return False

    return bool(re.search(r"(?i)#shorts\b", title))


def _uploads_video_ids(api_key, channel_id):
    """Resolve official channel uploads and paginate all available video IDs."""
    import re

    response = _youtube(
        'channels',
        {'part': 'contentDetails', 'id': channel_id},
        api_key,
    )
    channel = next(
        (item for item in response.get('items', [])
         if item.get('id') == channel_id),
        None,
    )
    if channel is None:
        raise ValueError('Configured channel not found')

    playlist_id = (
        channel.get('contentDetails', {})
        .get('relatedPlaylists', {})
        .get('uploads')
    )
    if (not isinstance(playlist_id, str)
            or not re.fullmatch(r'UU[A-Za-z0-9_-]{22}', playlist_id)):
        raise ValueError('Invalid official uploads playlist')

    ids = []
    seen_ids = set()
    seen_tokens = set()
    token = None

    for _ in range(200):
        params = {
            'part': 'contentDetails',
            'playlistId': playlist_id,
            'maxResults': 50,
        }
        if token:
            params['pageToken'] = token

        page = _youtube('playlistItems', params, api_key)

        for item in page.get('items', []):
            vid = item.get('contentDetails', {}).get('videoId')
            if (
                isinstance(vid, str)
                and re.fullmatch(r'[A-Za-z0-9_-]{11}', vid)
                and vid not in seen_ids
            ):
                seen_ids.add(vid)
                ids.append(vid)

        token = page.get('nextPageToken')
        if not token:
            return playlist_id, ids

        if not isinstance(token, str) or token in seen_tokens:
            raise ValueError('Invalid or repeated uploads page token')

        seen_tokens.add(token)

    raise ValueError('Uploads exceeded supported page limit')


# Uploads is a discovery source, not an automatic MV classification.
# Only high-confidence full music uploads are auto-published.
_UPLOAD_BLOCKED_TITLE = re.compile(
    r'(?i)(?:teaser|trailer|\bspot\b|preview|behind[ -]*the[ -]*scenes|'
    r'\binterview\b|\bcommentary\b|\bannouncement\b|\bcountdown\b|'
    r'\bcoming soon\b|\bkick[ -]*off\b|\bout now\b|\bpremiere?\b|\bmv\s+\d|'
    r'\brelease\b|\btickets?\b|\bblu[ -]*ray\b|\bdvd\b|'
    r'\balbum\b|\bspecial\b|world tour|stadium live|dome tour|'
    r'\bthank you\b|\blive[ -]*stream\b|youtube live|'
    r'\bcommercial\b|\bcm\b|\bshorts?\b|\bpre[ -]*order\b|'
    r'\u30c6\u30a3\u30b6\u30fc|\u4e88\u544a|\u544a\u77e5|'
    r'\u30c0\u30a4\u30b8\u30a7\u30b9\u30c8|'
    r'\u5546\u54c1\u89e3\u8aac|\u30a2\u30eb\u30d0\u30e0|'
    r'\u914d\u4fe1\u4e2d|\u767a\u58f2|\u4e88\u7d04|'
    r'\u516c\u958b\u3057\u307e\u3057\u305f|'
    r'\u516c\u958b\u3057\u307e\u3059|'
    r'\u30af\u30ed\u30b9\u30d5\u30a7\u30fc\u30c9|'
    r'\u9078\u624b\u6a29)'
)

_UPLOAD_MUSIC_TITLE = re.compile(
    r'(?i)(?:^\s*\u3010ado(?:\u3011|\u3068[^\u3011]*\u3011)|'
    r'^\s*\[ado\]|official audio|lyric video|music video|'
    r'\bmv\b|covered by ado|\u6b4c\u3044\u307e\u3057\u305f|'
    r'\u3010live\u6620\u50cf\u3011|'
    r'\u30e9\u30a4\u30d6\u6620\u50cf|'
    r'\u521d\u62ab\u9732|\binstrumental\b|\boff[ -]*vocal\b|'
    r'\u30a4\u30f3\u30b9\u30c8\u30a5\u30eb\u30e1\u30f3\u30bf\u30eb)'
)

_UPLOAD_PERFORMANCE_TITLE = re.compile(
    r'(?i)^\s*\u300c.+?\u300d.+?(?:\bat\b|@|'
    r'peacock theater|\u30a2\u30ea\u30fc\u30ca|'
    r'\u30c9\u30fc\u30e0)'
)


def _is_upload_music(item):
    """Conservative full-music acceptance for upload-only videos."""
    raw_duration = item.get("contentDetails", {}).get("duration", "")
    if not isinstance(raw_duration, str):
        return False

    match = re.fullmatch(
        r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?",
        raw_duration,
    )
    if not match or not any(x is not None for x in match.groups()):
        return False

    hours, minutes, seconds = (
        int(part or 0) for part in match.groups()
    )

    if hours * 3600 + minutes * 60 + seconds < 90:
        return False

    title = item.get("snippet", {}).get("title", "")
    if not isinstance(title, str):
        return False

    if _UPLOAD_BLOCKED_TITLE.search(title):
        return False

    return bool(
        _UPLOAD_MUSIC_TITLE.search(title)
        or _UPLOAD_PERFORMANCE_TITLE.search(title)
    )


def _fetch_catalog(api_key, channel_id):
    memberships = {}
    sources = []
    failures = (HTTPException, HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError)
    # One metadata request validates ownership of every configured playlist.
    try:
        metadata = _youtube(
            'playlists',
            {'part': 'snippet', 'id': ','.join(SOURCES)},
            api_key,
        )
        owned = {
            p['id']: p['snippet']
            for p in metadata.get('items', [])
            if p.get('snippet', {}).get('channelId') == channel_id
        }
    except failures:
        owned = {}
    for playlist_id, (title, _) in SOURCES.items():
        try:
            if playlist_id not in owned:
                raise ValueError('Playlist owner mismatch or unavailable')
            ids = _playlist_video_ids(api_key, playlist_id)
            sources.append(CatalogSource(id=playlist_id, title=owned[playlist_id]['title'], available=True, item_count=len(ids)))
            for vid in ids:
                if vid not in EXCLUDED_IDS:
                    memberships.setdefault(vid, []).append(playlist_id)
        except failures:
            sources.append(CatalogSource(id=playlist_id, title=title, available=False))

    try:
        uploads_id, upload_ids = _uploads_video_ids(api_key, channel_id)
        sources.append(CatalogSource(
            id=uploads_id,
            title='Ado official uploads',
            available=True,
            item_count=len(upload_ids),
        ))
        for vid in upload_ids:
            if vid not in EXCLUDED_IDS:
                memberships.setdefault(vid, []).append(uploads_id)
    except failures:
        sources.append(CatalogSource(
            id='uploads:' + channel_id,
            title='Ado official uploads',
            available=False,
        ))

    feed_source_id = "feed:" + channel_id

    try:
        feed_ids = _recent_feed_video_ids(channel_id)

        sources.append(CatalogSource(
            id=feed_source_id,
            title="Ado recent feed",
            available=True,
            item_count=len(feed_ids),
        ))

        for vid in feed_ids:
            if vid not in EXCLUDED_IDS:
                memberships.setdefault(vid, []).append(
                    feed_source_id
                )

    except failures + (ET.ParseError,):
        sources.append(CatalogSource(
            id=feed_source_id,
            title="Ado recent feed",
            available=False,
        ))

    if not any(s.available for s in sources):
        raise ValueError('No catalog sources available')
    videos = []
    nonmusic_ids = set()
    ids = list(memberships)
    for offset in range(0, len(ids), 50):
        page = _youtube('videos', {'part': 'snippet,statistics,status,localizations,contentDetails', 'id': ','.join(ids[offset:offset + 50])}, api_key)
        for item in page.get('items', []):
            vid = item.get('id')
            if vid not in memberships:
                continue

            playlist_ids = memberships[vid]
            curated = any(pid in SOURCES for pid in playlist_ids)

            if not curated:
                snippet = item.get("snippet", {})

                # Unknown classification must not hide a new upload.
                if (
                    snippet.get("channelId") != channel_id
                    or _confirmed_short(item)
                ):
                    nonmusic_ids.add(vid)
                    continue

            try:
                video = _video(item, playlist_ids)
                if video:
                    videos.append(video)
            except (ValueError, KeyError, TypeError):
                # A malformed individual record is unavailable, not fabricated.
                continue
    found = {v.id for v in videos}
    return CatalogResponse(
        fetched_at=datetime.now(timezone.utc),
        partial=any(not s.available for s in sources), sources=sources,
        videos=sorted({v.id: v for v in videos}.values(), key=lambda v: v.id),
        unavailable_video_ids=[vid for vid in ids if vid not in found and vid not in nonmusic_ids],
    )


_cache = None
_cache_until = 0.0
_lock = Lock()


@router.get('/catalog', response_model=CatalogResponse)
def mv_catalog():
    global _cache, _cache_until

    with _lock:
        now = time.monotonic()

        if _cache is not None and now < _cache_until:
            return _cache.model_copy(update={'cached': True})

        try:
            api_key, channel_id, _ = _configuration()
            result = _fetch_catalog(api_key, channel_id)

        except (
            HTTPException,
            HTTPError,
            URLError,
            TimeoutError,
            OSError,
            ValueError,
            KeyError,
            TypeError,
        ):
            # Prefer an existing in-memory result. A failed refresh
            # must not erase already discovered videos.
            if _cache is not None and _cache.videos:
                _cache_until = time.monotonic() + 60
                return _cache.model_copy(update={'cached': True})

            # After a process restart, restore the last saved result.
            try:
                saved = load_catalog()
                restored = (
                    CatalogResponse.model_validate(saved)
                    if saved is not None
                    else None
                )
            except (
                OSError,
                sqlite3.Error,
                ValueError,
                TypeError,
            ):
                restored = None

            if restored is None or not restored.videos:
                raise HTTPException(
                    503,
                    'MV catalog is temporarily unavailable',
                ) from None

            _cache = restored
            _cache_until = time.monotonic() + 60
            return restored.model_copy(update={'cached': True})

        # Only a complete, non-empty result can replace the
        # last successful persistent snapshot.
        if not result.partial and result.videos:
            try:
                save_catalog(result)
            except (OSError, sqlite3.Error):
                logging.getLogger(__name__).warning(
                    "MV catalog snapshot save failed"
                )

        _cache = result
        _cache_until = (
            time.monotonic() + (60 if result.partial else 600)
        )
        return result

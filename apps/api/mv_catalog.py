"""Playlist-backed discovery catalog; deliberately separate from Analytics snapshots."""
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Literal
from urllib.error import HTTPError, URLError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
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
    source: str = 'YouTube Data API v3 · Ado official playlists'
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
        SOURCES[pid][1] for pid in playlist_ids if SOURCES[pid][1]
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


def _fetch_catalog(api_key, channel_id):
    memberships = {}
    sources = []
    failures = (HTTPException, HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError)
    # One metadata request validates ownership of every configured playlist.
    metadata = _youtube('playlists', {'part': 'snippet', 'id': ','.join(SOURCES)}, api_key)
    owned = {p['id']: p['snippet'] for p in metadata.get('items', [])
             if p.get('snippet', {}).get('channelId') == channel_id}
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
    if not any(s.available for s in sources):
        raise ValueError('No catalog sources available')
    videos = []
    ids = list(memberships)
    for offset in range(0, len(ids), 50):
        page = _youtube('videos', {'part': 'snippet,statistics,status,localizations', 'id': ','.join(ids[offset:offset + 50])}, api_key)
        for item in page.get('items', []):
            vid = item.get('id')
            if vid not in memberships:
                continue
            try:
                video = _video(item, memberships[vid])
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
        unavailable_video_ids=[vid for vid in ids if vid not in found],
    )


_cache = None
_cache_until = 0.0
_lock = Lock()


@router.get('/catalog', response_model=CatalogResponse)
def mv_catalog():
    global _cache, _cache_until
    with _lock:
        if _cache is not None and time.monotonic() < _cache_until:
            return _cache.model_copy(update={'cached': True})
        api_key, channel_id, _ = _configuration()
        try:
            result = _fetch_catalog(api_key, channel_id)
        except (HTTPException, HTTPError, URLError, TimeoutError, OSError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'MV catalog is temporarily unavailable') from None
        _cache = result
        # Retry failed sources sooner, while retaining useful available results.
        _cache_until = time.monotonic() + (60 if result.partial else 600)
        return result

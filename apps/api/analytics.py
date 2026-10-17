import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Annotated
from threading import Lock
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel
import sqlite3
from analytics_store import (
    initialize_database,
    read_channel_history,
    save_channel_snapshot,
)

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])

CACHE_SECONDS = 600
_cache = None
_cache_until = 0.0
_lock = Lock()


class ChannelStats(BaseModel):
    id: str
    title: str
    avatar_url: str | None = None
    subscriber_count: int | None
    subscriber_count_is_approximate: bool = True
    view_count: int | None
    video_count: int | None


class VideoStats(BaseModel):
    id: str
    title: str
    categories: list[str]
    published_at: datetime
    thumbnail_url: str | None
    view_count: int | None
    url: str


class YouTubeAnalytics(BaseModel):
    source: str = "YouTube Data API v3"
    fetched_at: datetime
    cached: bool
    channel: ChannelStats
    videos: list[VideoStats]
    unavailable_video_ids: list[str]


def _number(data, field):
    value = data.get(field)
    return int(value) if value is not None else None


def _youtube(resource, params, api_key):
    request = Request(
        "https://www.googleapis.com/youtube/v3/"
        + resource
        + "?"
        + urlencode(params),
        headers={
            "Accept": "application/json",
            "X-Goog-Api-Key": api_key,
        },
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def _configuration():
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    channel_id = os.environ.get("YOUTUBE_CHANNEL_ID", "").strip()
    video_ids = list(dict.fromkeys(
        item.strip()
        for item in os.environ.get("YOUTUBE_MV_IDS", "").split(",")
        if item.strip()
    ))

    if not api_key or not channel_id:
        raise HTTPException(
            status_code=503,
            detail="YouTube analytics is not configured",
        )

    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id):
        raise HTTPException(
            status_code=503,
            detail="YouTube channel configuration is invalid",
        )

    if len(video_ids) > 50 or any(
        not re.fullmatch(r"[A-Za-z0-9_-]{11}", item)
        for item in video_ids
    ):
        raise HTTPException(
            status_code=503,
            detail="YouTube MV configuration is invalid",
        )

    return api_key, channel_id, video_ids

MV_PLAYLISTS = {
    "original": "PLaxauk3chSWgwI1W0yo5Bv9GAn1O1cwKB",
    "cover": "PLaxauk3chSWjJUBirUlCQH9fOgvfiNjcc",
}


def _playlist_video_ids(api_key, playlist_id):
    video_ids = []
    seen_ids = set()
    seen_tokens = set()
    page_token = None

    for _ in range(20):
        params = {
            "part": "contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
        }
        if page_token:
            params["pageToken"] = page_token

        page = _youtube("playlistItems", params, api_key)

        for item in page.get("items", []):
            video_id = item.get("contentDetails", {}).get("videoId")
            if (
                isinstance(video_id, str)
                and re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id)
                and video_id not in seen_ids
            ):
                seen_ids.add(video_id)
                video_ids.append(video_id)

        page_token = page.get("nextPageToken")
        if not page_token:
            return video_ids

        if page_token in seen_tokens:
            raise ValueError("Repeated playlist page")
        seen_tokens.add(page_token)

    raise ValueError("Playlist exceeds supported page count")

def _fetch(api_key, channel_id, video_ids):
    category_ids = {
        category: _playlist_video_ids(api_key, playlist_id)
        for category, playlist_id in MV_PLAYLISTS.items()
    }
    video_ids = list(dict.fromkeys(
        video_id
        for ids in category_ids.values()
        for video_id in ids
    ))
    channel_data = _youtube(
        "channels",
        {"part": "snippet,statistics", "id": channel_id},
        api_key,
    )
    channels = channel_data.get("items", [])
    if not channels:
        raise HTTPException(
            status_code=503,
            detail="Configured YouTube channel is unavailable",
        )

    channel = channels[0]
    stats = channel["statistics"]
    thumbnails = channel.get("snippet", {}).get("thumbnails", {})
    avatar = (
        thumbnails.get("high")
        or thumbnails.get("medium")
        or thumbnails.get("default")
        or {}
    )
    channel_stats = ChannelStats(
        id=channel["id"],
        title=channel["snippet"]["title"],
        avatar_url=avatar.get("url"),
        subscriber_count=(
            None
            if stats.get("hiddenSubscriberCount", False)
            else _number(stats, "subscriberCount")
        ),
        view_count=_number(stats, "viewCount"),
        video_count=_number(stats, "videoCount"),
    )

    videos = []
    found_ids = set()
    if video_ids:
        video_items = []

        for start in range(0, len(video_ids), 50):
            batch_ids = video_ids[start:start + 50]
            video_data = _youtube(
                "videos",
                {
                    "part": "snippet,statistics",
                    "id": ",".join(batch_ids),
                },
                api_key,
            )
            video_items.extend(video_data.get("items", []))

        for item in video_items:
            snippet = item["snippet"]
            if snippet["channelId"] != channel_id:
                raise HTTPException(
                    status_code=503,
                    detail="An MV does not belong to the configured channel",
                )

            thumbnails = snippet.get("thumbnails", {})
            thumbnail = (
                thumbnails.get("high")
                or thumbnails.get("medium")
                or thumbnails.get("default")
                or {}
            )
            videos.append(VideoStats(
                id=item["id"],
                title=snippet["title"],
                categories=[
                    category
                    for category, ids in category_ids.items()
                    if item["id"] in ids
                ],
                published_at=snippet["publishedAt"],
                thumbnail_url=thumbnail.get("url"),
                view_count=_number(item.get("statistics", {}), "viewCount"),
                url="https://www.youtube.com/watch?v=" + item["id"],
            ))
            found_ids.add(item["id"])

    videos.sort(
        key=lambda item: (
            item.view_count is not None,
            item.view_count if item.view_count is not None else 0,
        ),
        reverse=True,
    )
    return YouTubeAnalytics(
        fetched_at=datetime.now(timezone.utc),
        cached=False,
        channel=channel_stats,
        videos=videos,
        unavailable_video_ids=[
            item for item in video_ids if item not in found_ids
        ],
    )


@router.get("/youtube", response_model=YouTubeAnalytics)
def youtube_analytics():
    global _cache, _cache_until

    with _lock:
        if _cache is not None and time.monotonic() < _cache_until:
            return _cache.model_copy(update={"cached": True})

        api_key, channel_id, video_ids = _configuration()
        try:
            result = _fetch(api_key, channel_id, video_ids)
            initialize_database()
            save_channel_snapshot(result)
        except HTTPException:
            raise
        except sqlite3.Error:
            raise HTTPException(
                status_code=503,
                detail="Analytics snapshot storage is temporarily unavailable",
            ) from None
        except (
            HTTPError, URLError, TimeoutError, OSError,
            ValueError, KeyError, TypeError,
        ):
            # Never expose upstream requests, credentials, or response bodies.
            raise HTTPException(
                status_code=503,
                detail="YouTube data is temporarily unavailable",
            ) from None

        _cache = result
        _cache_until = time.monotonic() + CACHE_SECONDS
        return result

_avatar_cache = None
_avatar_cache_until = 0.0
_avatar_retry_after = 0.0
_avatar_lock = Lock()


@router.get("/youtube/avatar")
def youtube_avatar():
    global _avatar_cache, _avatar_cache_until, _avatar_retry_after

    with _avatar_lock:
        now = time.monotonic()

        if _avatar_cache is None or now >= _avatar_cache_until:
            if now < _avatar_retry_after:
                raise HTTPException(
                    status_code=503,
                    detail="Channel avatar is temporarily unavailable",
                )

            # Limit retries when the image source is unavailable.
            _avatar_retry_after = now + 60

            try:
                avatar_url = youtube_analytics().channel.avatar_url
                if not avatar_url:
                    raise ValueError("No avatar available")

                request = Request(
                    avatar_url,
                    headers={"Accept": "image/jpeg,image/png,image/webp"},
                )
                with urlopen(request, timeout=15) as upstream:
                    media_type = upstream.headers.get_content_type()
                    if media_type not in {
                        "image/jpeg", "image/png", "image/webp"
                    }:
                        raise ValueError("Unexpected image type")

                    content = upstream.read(2_000_001)
                    if not content or len(content) > 2_000_000:
                        raise ValueError("Invalid image size")

                _avatar_cache = (content, media_type)
                _avatar_cache_until = time.monotonic() + 3600
                _avatar_retry_after = 0.0
            except (
                HTTPException, HTTPError, URLError, TimeoutError,
                OSError, ValueError, KeyError, TypeError,
            ):
                raise HTTPException(
                    status_code=503,
                    detail="Channel avatar is temporarily unavailable",
                ) from None

        content, media_type = _avatar_cache
        return Response(
            content=content,
            media_type=media_type,
            headers={"Cache-Control": "public, max-age=3600"},
        )

class ChannelHistoryPoint(BaseModel):
    fetched_at: datetime
    subscriber_count: int | None
    subscriber_count_is_approximate: bool
    view_count: int | None
    video_count: int | None


class ChannelHistory(BaseModel):
    channel_id: str
    days: int
    since: datetime
    limit: int
    truncated: bool
    points: list[ChannelHistoryPoint]


@router.get("/youtube/history", response_model=ChannelHistory)
def youtube_history(
    days: Annotated[int, Query(ge=1, le=90)] = 30,
    limit: Annotated[int, Query(ge=1, le=10000)] = 10000,
):
    channel_id = os.environ.get("YOUTUBE_CHANNEL_ID", "").strip()
    if not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id):
        raise HTTPException(
            status_code=503,
            detail="YouTube channel configuration is invalid",
        )

    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        points = read_channel_history(
            channel_id, since.isoformat(), limit + 1
        )
    except (sqlite3.Error, OSError):
        raise HTTPException(
            status_code=503,
            detail="Analytics history is temporarily unavailable",
        ) from None

    return ChannelHistory(
        channel_id=channel_id,
        days=days,
        since=since,
        limit=limit,
        truncated=len(points) > limit,
        points=points[-limit:],
    )
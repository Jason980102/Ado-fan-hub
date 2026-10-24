"""Models and pure validation for Ado's curated third-party videos.

This module performs no HTTP calls and no database writes.
"""

import re
from pydantic import BaseModel, ConfigDict

PLAYLIST_ID = "PLaxauk3chSWgJmo2hBhN34rO8sUEwWiQx"
OFFICIAL_CHANNEL_ID = "UCln9P4Qm3-EAY4aiEPmRwEA"
VIDEO_ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{11}")


class CuratedVideo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    title: str
    channel_id: str
    channel_title: str
    thumbnail_url: str | None
    url: str


class CuratedPlaylist(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playlist_id: str
    title: str
    owner_channel_id: str
    videos: list[CuratedVideo]


def build_curated_playlist(metadata, video_ids, items):
    """Validate one official playlist and its fetched public videos.

    Unavailable/private videos are omitted, never treated as Ado MVs.
    Callers must supply complete, already-fetched YouTube responses.
    """
    if (
        not isinstance(metadata, dict)
        or metadata.get("id") != PLAYLIST_ID
        or metadata.get("snippet", {}).get("channelId")
        != OFFICIAL_CHANNEL_ID
    ):
        raise ValueError("Official playlist ownership mismatch")

    title = metadata["snippet"].get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("Missing playlist title")

    if not isinstance(video_ids, list) or any(
        not isinstance(vid, str)
        or not VIDEO_ID_PATTERN.fullmatch(vid)
        for vid in video_ids
    ):
        raise ValueError("Invalid playlist members")

    if not isinstance(items, list):
        raise ValueError("Invalid video metadata response")

    records = {}
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid video metadata")
        vid = item.get("id")
        if not isinstance(vid, str) or not VIDEO_ID_PATTERN.fullmatch(vid):
            raise ValueError("Invalid video metadata ID")
        if vid in records:
            raise ValueError("Duplicate video metadata")
        records[vid] = item

    requested = set(video_ids)
    if set(records) - requested:
        raise ValueError("Unexpected video metadata")

    videos = []
    for vid in dict.fromkeys(video_ids):
        item = records.get(vid)
        if item is None:
            continue

        snippet = item.get("snippet", {})
        status = item.get("status", {})
        if (
            not isinstance(snippet, dict)
            or not isinstance(status, dict)
        ):
            raise ValueError("Invalid video fields")

        if status.get("privacyStatus") != "public":
            continue

        name = snippet.get("title")
        channel_id = snippet.get("channelId")
        channel_title = snippet.get("channelTitle")

        if (
            not isinstance(name, str) or not name.strip()
            or not isinstance(channel_id, str)
            or not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", channel_id)
            or not isinstance(channel_title, str)
            or not channel_title.strip()
        ):
            raise ValueError("Invalid public video metadata")

        # This playlist is for third-party creator recommendations.
        if channel_id == OFFICIAL_CHANNEL_ID:
            raise ValueError("Official Ado upload in third-party collection")

        thumbnails = snippet.get("thumbnails", {})
        if not isinstance(thumbnails, dict):
            thumbnails = {}

        thumbnail = next(
            (
                candidate.get("url")
                for size in ("high", "medium", "default")
                for candidate in [thumbnails.get(size, {})]
                if isinstance(candidate, dict)
                and isinstance(candidate.get("url"), str)
                and candidate["url"].startswith("https://i.ytimg.com/")
            ),
            None,
        )

        videos.append(CuratedVideo(
            id=vid,
            title=name,
            channel_id=channel_id,
            channel_title=channel_title,
            thumbnail_url=thumbnail,
            url="https://www.youtube.com/watch?v=" + vid,
        ))

    return CuratedPlaylist(
        playlist_id=PLAYLIST_ID,
        title=title,
        owner_channel_id=OFFICIAL_CHANNEL_ID,
        videos=videos,
    )

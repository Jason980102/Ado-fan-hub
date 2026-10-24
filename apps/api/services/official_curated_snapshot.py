"""Read a validated, independently managed official-picks snapshot."""

import json
import os
from pathlib import Path

from pydantic import ValidationError

from services.official_curated_playlist import (
    CuratedPlaylist,
    OFFICIAL_CHANNEL_ID,
    PLAYLIST_ID,
)

DEFAULT_SNAPSHOT = (
    Path(__file__).resolve().parent.parent
    / "data" / "official_curated_playlist.json"
)


def load_curated_snapshot(path=None):
    """Load an immutable published snapshot. Never fetch YouTube here."""
    selected = Path(path) if path is not None else DEFAULT_SNAPSHOT

    try:
        payload = json.loads(selected.read_text(encoding="utf-8"))
        result = CuratedPlaylist.model_validate(payload)
    except (OSError, ValueError, ValidationError) as exc:
        raise RuntimeError("Official curated snapshot unavailable") from exc

    if (
        result.playlist_id != PLAYLIST_ID
        or result.owner_channel_id != OFFICIAL_CHANNEL_ID
    ):
        raise RuntimeError("Official curated snapshot identity mismatch")

    if len({video.id for video in result.videos}) != len(result.videos):
        raise RuntimeError("Duplicate curated video ID")

    if any(video.channel_id == OFFICIAL_CHANNEL_ID for video in result.videos):
        raise RuntimeError("Official upload in third-party recommendations")

    return result

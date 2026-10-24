"""Refresh MV categories exclusively from official playlists."""

import re
import time
from datetime import datetime, timezone

import mv_catalog as catalog
from services.mv_catalog_db import load_catalog_from_db
from services.mv_playlist_writer import save_playlist_memberships


def sync_official_playlists():
    """Refresh approved playlist memberships for stored videos.

    Existing videos outside playlists remain unclassified.
    A failed playlist validation/fetch never overwrites SQLite.
    """
    with catalog._lock:
        api_key, channel_id, _ = catalog._configuration()

        # PostgreSQL is the authoritative MV catalog.
        base = load_catalog_from_db()


        if base.partial or not base.videos:
            raise RuntimeError("No complete catalog available")

        # Validate every configured playlist belongs to Ado.
        metadata = catalog._youtube(
            "playlists",
            {
                "part": "snippet",
                "id": ",".join(catalog.SOURCES),
            },
            api_key,
        )

        owned = {
            item["id"]: item["snippet"]
            for item in metadata.get("items", [])
            if (
                item.get("id") in catalog.SOURCES
                and item.get("snippet", {}).get("channelId")
                == channel_id
            )
        }

        if set(owned) != set(catalog.SOURCES):
            raise ValueError("Official playlist ownership incomplete")

        memberships = {}
        playlist_sources = {}

        # All reads must succeed before modifying stored data.
        for playlist_id in catalog.SOURCES:
            ids = catalog._playlist_video_ids(
                api_key, playlist_id
            )

            if not isinstance(ids, list):
                raise ValueError("Invalid playlist result")

            checked = set()

            for vid in ids:
                if (
                    not isinstance(vid, str)
                    or not re.fullmatch(
                        r"[A-Za-z0-9_-]{11}", vid
                    )
                ):
                    raise ValueError("Invalid playlist video ID")
                checked.add(vid)

            memberships[playlist_id] = checked
            playlist_sources[playlist_id] = catalog.CatalogSource(
                id=playlist_id,
                title=owned[playlist_id]["title"],
                available=True,
                item_count=len(checked),
            )

        # Persist playlist-only fields using the database transaction lock.
        # Never overwrite title, statistics, thumbnails, or aliases.
        changes = save_playlist_memberships(
            memberships,
            playlist_sources,
        )

        # Refresh from PostgreSQL to avoid caching stale video metadata.
        updated = load_catalog_from_db()

        catalog._cache = updated
        catalog._cache_until = time.monotonic() + 600

        return changes

"""Refresh MV categories exclusively from official playlists."""

import re
import time
from datetime import datetime, timezone

import mv_catalog as catalog
from mv_store import load_catalog, save_catalog


def sync_official_playlists():
    """Refresh approved playlist memberships for stored videos.

    Existing videos outside playlists remain unclassified.
    A failed playlist validation/fetch never overwrites SQLite.
    """
    with catalog._lock:
        api_key, channel_id, _ = catalog._configuration()

        saved = load_catalog()
        if saved is None:
            raise RuntimeError("No saved catalog; full sync required")

        base = catalog.CatalogResponse.model_validate(saved)

        memory = catalog._cache
        if (
            memory is not None
            and not memory.partial
            and memory.fetched_at > base.fetched_at
        ):
            base = memory.model_copy(deep=True)

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

        updated = base.model_copy(deep=True)
        updated.sources = [
            playlist_sources.get(source.id, source)
            for source in updated.sources
        ]

        existing_sources = {s.id for s in updated.sources}

        for pid, source in playlist_sources.items():
            if pid not in existing_sources:
                updated.sources.append(source)

        changes = 0

        for video in updated.videos:
            # Preserve Uploads, RSS and other non-category sources.
            non_playlist = [
                pid for pid in video.playlist_ids
                if pid not in catalog.SOURCES
            ]

            official = [
                pid for pid, ids in memberships.items()
                if video.id in ids
            ]

            new_ids = list(dict.fromkeys(
                non_playlist + official
            ))

            categories = list(dict.fromkeys(
                catalog.SOURCES[pid][1]
                for pid in official
                if catalog.SOURCES[pid][1]
            ))

            # Preserve the existing, human-verified
            # collaboration exceptions only where a verified
            # official playlist still contains the video.
            if official:
                for category in catalog.VERIFIED_CATEGORIES.get(
                    video.id, []
                ):
                    if category not in categories:
                        categories.append(category)

            if not categories:
                categories = ["unclassified"]

            membership_changed = (
                set(video.playlist_ids) != set(new_ids)
            )
            category_changed = (
                set(video.categories) != set(categories)
            )

            if membership_changed or category_changed:
                changes += 1

                if membership_changed:
                    video.playlist_ids = new_ids

                if category_changed:
                    video.categories = categories

        updated.fetched_at = datetime.now(timezone.utc)
        updated.cached = False
        updated.partial = False

        # Persist before publishing to the in-memory API cache.
        save_catalog(updated)

        catalog._cache = updated
        catalog._cache_until = time.monotonic() + 600

        return changes

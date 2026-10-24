"""Incremental discovery of recent official YouTube uploads."""

import time
from datetime import datetime, timezone

import mv_catalog as catalog
from services.mv_catalog_db import load_catalog_from_db
from services.mv_persistence import persist_mv_catalog


def sync_recent_feed():
    """Add newly discovered official videos to a complete snapshot.

    Returns the number of newly accepted videos.
    Never overwrites a saved snapshot after a failed fetch.
    """

    # Share the same lock used by /api/mv/catalog.
    with catalog._lock:
        api_key, channel_id, _ = catalog._configuration()

        # PostgreSQL is the authoritative MV catalog.
        base = load_catalog_from_db()


        if base.partial or not base.videos:
            raise RuntimeError("No complete MV catalog available")

        feed_ids = catalog._recent_feed_video_ids(channel_id)
        feed_ids = list(dict.fromkeys(feed_ids))

        existing = {video.id: video for video in base.videos}

        missing = [
            vid for vid in feed_ids
            if vid not in existing
            and vid not in catalog.EXCLUDED_IDS
        ]

        # No new IDs: no YouTube videos.list call and no database write.
        if not missing:
            return 0

        response = catalog._youtube(
            "videos",
            {
                "part": (
                    "snippet,statistics,status,"
                    "localizations,contentDetails"
                ),
                "id": ",".join(missing),
            },
            api_key,
        )

        returned = {
            item.get("id"): item
            for item in response.get("items", [])
            if item.get("id") in missing
        }

        # An incomplete metadata response is not accepted as success.
        if set(returned) != set(missing):
            raise ValueError("Incomplete recent-video metadata response")

        feed_source_id = "feed:" + channel_id
        additions = []

        for vid in missing:
            item = returned[vid]

            if item.get("snippet", {}).get("channelId") != channel_id:
                raise ValueError("Recent-video channel mismatch")

            if catalog._confirmed_short(item):
                continue

            video = catalog._video(item, [feed_source_id])

            if video is None:
                # Not yet publicly available or fully processed.
                continue

            additions.append(video)

        if not additions:
            return 0

        updated = base.model_copy(deep=True)

        by_id = {video.id: video for video in updated.videos}

        for video in additions:
            by_id[video.id] = video

        updated.videos = sorted(
            by_id.values(),
            key=lambda video: video.id,
        )

        feed_source = next(
            (
                source for source in updated.sources
                if source.id == feed_source_id
            ),
            None,
        )

        if feed_source is None:
            updated.sources.append(
                catalog.CatalogSource(
                    id=feed_source_id,
                    title="Ado recent feed",
                    available=True,
                    item_count=len(feed_ids),
                )
            )
        else:
            feed_source.available = True
            feed_source.item_count = len(feed_ids)

        updated.fetched_at = datetime.now(timezone.utc)
        updated.cached = False

        # Persist first. Only publish the new memory cache after
        # the transaction succeeds.
        persist_mv_catalog(updated)

        catalog._cache = updated
        catalog._cache_until = time.monotonic() + 600

        return len(additions)

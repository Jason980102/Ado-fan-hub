"""Periodic complete reconciliation of official Ado uploads."""

import time
import mv_catalog as catalog
from services.mv_persistence import persist_mv_catalog


def sync_full_uploads():
    """Refresh the complete catalog without destroying a good snapshot.

    Return the number of videos in the refreshed catalog.
    A partial/empty refresh is treated as a failure.
    """

    # Prevent overlap with MV API and other sync jobs.
    with catalog._lock:
        api_key, channel_id, _ = catalog._configuration()
        result = catalog._fetch_catalog(api_key, channel_id)

        if result.partial:
            raise RuntimeError(
                "Full MV synchronization was partial"
            )

        if not result.videos:
            raise RuntimeError(
                "Full MV synchronization returned no videos"
            )

        # PostgreSQL must commit before publishing the new cache.
        persist_mv_catalog(result)

        catalog._cache = result
        catalog._cache_until = time.monotonic() + 600

        return len(result.videos)

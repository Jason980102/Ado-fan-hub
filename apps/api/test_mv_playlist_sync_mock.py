"""Offline helper for testing playlist sync with the new database writer."""

import mv_catalog as catalog


def simulate_playlist_write(base, memberships, playlist_sources):
    """Simulate playlist-only updates without touching a database."""
    if set(memberships) != set(catalog.SOURCES):
        raise ValueError("Incomplete playlist memberships")

    if set(playlist_sources) != set(catalog.SOURCES):
        raise ValueError("Incomplete playlist sources")

    updated = base.model_copy(deep=True)

    existing_sources = {
        source.id: source
        for source in updated.sources
    }

    existing_sources.update(playlist_sources)
    updated.sources = list(existing_sources.values())

    changes = 0

    for video in updated.videos:
        non_playlist = [
            pid for pid in video.playlist_ids
            if pid not in catalog.SOURCES
        ]

        official = [
            pid for pid, ids in memberships.items()
            if video.id in ids
        ]

        new_ids = list(dict.fromkeys(non_playlist + official))

        categories = list(dict.fromkeys(
            catalog.SOURCES[pid][1]
            for pid in official
            if catalog.SOURCES[pid][1]
        ))

        if official:
            for category in catalog.VERIFIED_CATEGORIES.get(
                video.id, []
            ):
                if category not in categories:
                    categories.append(category)

        if not categories:
            categories = ["unclassified"]

        if (
            set(video.playlist_ids) != set(new_ids)
            or set(video.categories) != set(categories)
        ):
            video.playlist_ids = new_ids
            video.categories = categories
            changes += 1

    return changes, updated

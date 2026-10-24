"""Resumable, bounded historical news synchronization."""

import argparse
from datetime import datetime, timezone

from sqlalchemy import select

from database.entities import NewsSyncState
from database.session import create_db_engine, create_session_factory
from news_sources.fanclub import fetch_fanclub_raw_batch
from news_sources.wordpress import fetch_official_news_page
from services.news_db_sync import sync_source


BATCH_SIZE = {
    "fanclub": 24,
    "universal": 20,
}


def read_state(source_code):
    engine = create_db_engine()
    try:
        factory = create_session_factory(engine)
        with factory() as session:
            state = session.get(NewsSyncState, source_code)
            if state is None:
                return 0, None
            return state.next_offset, state.upstream_total
    finally:
        engine.dispose()


def save_state(source_code, next_offset, upstream_total, error=None, expected_offset=None):
    engine = create_db_engine()
    try:
        factory = create_session_factory(engine)
        with factory.begin() as session:
            state = session.execute(select(NewsSyncState).where(
                NewsSyncState.source_code == source_code
            ).with_for_update()).scalar_one_or_none()

            if expected_offset is not None and state is not None and state.next_offset != expected_offset:
                raise RuntimeError("Checkpoint changed concurrently; retry from saved state")

            if state is None:
                state = NewsSyncState(source_code=source_code)
                session.add(state)

            state.next_offset = next_offset
            state.upstream_total = upstream_total
            state.last_error = error
            state.updated_at = datetime.now(timezone.utc)

            if error is None:
                state.last_success_at = datetime.now(timezone.utc)
    finally:
        engine.dispose()


def fetch_batch(source_code, offset):
    size = BATCH_SIZE[source_code]

    if source_code == "fanclub":
        return fetch_fanclub_raw_batch(offset, size)

    # WordPress uses 1-based page numbers.
    if offset % size:
        raise ValueError("Universal offset is not page-aligned")

    page = offset // size + 1
    items, total = fetch_official_news_page(page=page, limit=size)
    expected = min(size, max(0, total - offset))
    if len(items) != expected:
        raise ValueError("Incomplete Universal page; checkpoint preserved")
    return items, total, offset + len(items)


def run_batch(source_code):
    if source_code not in BATCH_SIZE:
        raise ValueError("Unsupported source")

    offset, previous_total = read_state(source_code)

    if previous_total is not None and offset >= previous_total:
        print(
            "INFO:", source_code,
            "reached previous upstream total", previous_total,
            flush=True
        )
        return False

    print(
        "FETCH:", source_code,
        "offset:", offset,
        "batch:", BATCH_SIZE[source_code],
        flush=True
    )

    try:
        items, upstream_total, next_offset = fetch_batch(source_code, offset)

        if not items:
            print(
                "STOP:", source_code,
                "returned no normalized articles at offset", offset,
                flush=True
            )
            return False

        count = sync_source(source_code, items)

        # Checkpoint only after the article upsert committed.
        # A crash before this checkpoint can safely replay the batch.
        if next_offset <= offset or next_offset > upstream_total:
            raise ValueError("Invalid raw pagination progress")

        save_state(source_code, next_offset, upstream_total, expected_offset=offset)

        print(
            "PASS:", source_code,
            "upserted:", count,
            "next_offset:", next_offset,
            "upstream_total:", upstream_total,
            flush=True
        )

        return next_offset < upstream_total

    except Exception as exc:
        # Preserve the checkpoint. A retry replays this batch.
        try:
            save_state(
                source_code,
                offset,
                previous_total,
                error=str(exc)[:1000],
                expected_offset=offset,
            )
        except Exception as state_error:
            print(
                "WARNING: Failed to save sync error:",
                type(state_error).__name__,
                flush=True
            )
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        choices=sorted(BATCH_SIZE),
        required=True,
    )
    parser.add_argument(
        "--batches",
        type=int,
        default=1,
    )
    args = parser.parse_args()

    if not 1 <= args.batches <= 5:
        parser.error("--batches must be between 1 and 5")

    print("=== NEWS HISTORY WORKER ===", flush=True)

    for number in range(args.batches):
        print(
            "Batch", number + 1, "of", args.batches,
            flush=True
        )
        has_more = run_batch(args.source)
        if not has_more:
            break

    offset, upstream_total = read_state(args.source)

    print("=== FINAL CHECKPOINT ===", flush=True)
    print("Source:", args.source)
    print("Next offset:", offset)
    print("Upstream total:", upstream_total)
    print("PASS: Worker finished")


if __name__ == "__main__":
    main()

"""Offline-capable X synchronization core.

The caller owns the transaction. No X API calls are made here.
"""

import hashlib
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from database.entities import NewsArticle, NewsSource, XSyncState
from news_sources.x_originals import ACCOUNTS, is_original_post


DISPLAY_NAMES = {
    "x_ado": "X - Ado",
    "x_staff": "X - Ado Staff",
    "x_fanclub": "X - Ado Fan Club",
}


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError("Missing X created_at")
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError("X created_at must include a timezone")
    return result.astimezone(timezone.utc)


def sync_x_pages(session, source_code, x_user_id, pages, *, complete=False):
    """Synchronize an already-fetched, complete set of pages.

    All changes remain inside the caller's SQLAlchemy transaction.
    The caller must commit only after this function succeeds.
    """
    if source_code not in ACCOUNTS:
        raise ValueError("Unknown X source")
    if not isinstance(x_user_id, str) or not x_user_id.isdigit():
        raise ValueError("Unverified X user ID")
    if not complete:
        raise ValueError("Incomplete pagination; checkpoint not advanced")
    if not isinstance(pages, (list, tuple)):
        raise ValueError("Pages must be a materialized sequence")

    # Validate all supplied pages before any database write.
    posts = []
    seen = set()
    for page in pages:
        if not isinstance(page, (list, tuple)):
            raise ValueError("Invalid page")
        for post in page:
            if not isinstance(post, dict):
                raise ValueError("Invalid X post")
            post_id = post.get("id")
            author_id = post.get("author_id")
            if not isinstance(post_id, str) or not post_id.isdigit():
                raise ValueError("Invalid X post ID")
            if str(author_id) != x_user_id:
                raise ValueError("Unexpected post author")
            if post_id in seen:
                continue
            seen.add(post_id)
            posts.append(post)

    # Lock the source row so concurrent syncs for the same account serialize.
    session.execute(
        insert(NewsSource).values(
            code=source_code,
            display_name=DISPLAY_NAMES[source_code],
            is_active=True,
        ).on_conflict_do_nothing(index_elements=["code"])
    )
    session.execute(
        select(NewsSource)
        .where(NewsSource.code == source_code)
        .with_for_update()
    ).scalar_one()

    state = session.get(XSyncState, source_code)
    if state is not None and state.x_user_id not in (None, x_user_id):
        raise ValueError("X account ID changed; refusing to sync")

    since = int(state.since_id) if state and state.since_id else 0
    newest = since
    written = 0

    for post in posts:
        post_id = int(post["id"])
        if post_id <= since:
            continue

        newest = max(newest, post_id)

        if not is_original_post(post, x_user_id):
            continue

        text = post.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Original post has no text")

        published = _timestamp(post.get("created_at"))
        external_id = post["id"]
        identity = source_code + ":" + external_id
        article_id = hashlib.sha256(identity.encode("utf-8")).hexdigest()

        row = {
            "id": article_id,
            "source_code": source_code,
            "external_id": external_id,
            "title": text.strip()[:1000],
            "summary": text.strip(),
            "category": "social",
            "language": "ja",
            "access_level": "public",
            "source_url": (
                "https://x.com/" + ACCOUNTS[source_code]
                + "/status/" + external_id
            ),
            "image_url": None,
            "published_at": published,
            "last_synced_at": datetime.now(timezone.utc),
        }

        session.execute(
            insert(NewsArticle).values(**row).on_conflict_do_update(
                index_elements=["source_code", "external_id"],
                set_={
                    key: value for key, value in row.items()
                    if key not in {"id", "source_code", "external_id"}
                },
            )
        )
        written += 1

    if state is None:
        session.add(XSyncState(
            source_code=source_code,
            x_user_id=x_user_id,
            since_id=str(newest) if newest else None,
            last_success_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ))
    else:
        state.x_user_id = x_user_id
        state.since_id = str(newest) if newest else state.since_id
        state.last_success_at = datetime.now(timezone.utc)
        state.updated_at = datetime.now(timezone.utc)

    session.flush()
    return {"written": written, "since_id": str(newest) if newest else None}

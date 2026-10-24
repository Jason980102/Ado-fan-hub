"""X sync orchestration core. No built-in HTTP client.

Only use an offline fixture callback until paid API integration
and official billing verification have been completed.
"""

from news_sources.x_originals import ACCOUNTS
from news_sources.x_pagination import validate_x_pages
from services.x_budget_db import reserve_x_reads
from services.x_sync_worker import sync_x_pages


def run_x_sync_pipeline(
    session_factory,
    source_code,
    x_user_id,
    billing_month,
    max_posts,
    fetch_records,
    *,
    max_pages=20,
):
    """Reserve, fetch, validate, and sync in separate transactions.

    The reservation is committed before invoking fetch_records.
    Never automatically refund an ambiguous or failed request.

    fetch_records must return materialized (token, response) records.
    This function does not itself prove the callback is offline.
    """
    if source_code not in ACCOUNTS:
        raise ValueError("Unknown X account")
    if not isinstance(x_user_id, str) or not x_user_id.isdigit():
        raise ValueError("Invalid X account ID")
    if type(max_posts) is not int or max_posts < 1:
        raise ValueError("Invalid max_posts")
    if type(max_pages) is not int or max_pages < 1:
        raise ValueError("Invalid max_pages")
    if not callable(fetch_records):
        raise ValueError("fetch_records must be callable")

    # This transaction must commit BEFORE any request is attempted.
    with session_factory() as session:
        reservation = reserve_x_reads(
            session, billing_month, max_posts
        )
        session.commit()

    # No network client is provided by this module.
    # A failed callback must not undo the committed reservation.
    records = fetch_records()

    pages = validate_x_pages(records, max_pages=max_pages)

    received = sum(len(page) for page in pages)
    if received > max_posts:
        raise ValueError(
            "Received more posts than reserved; checkpoint unchanged"
        )

    # This independent transaction commits only after full validation.
    with session_factory() as session:
        sync_result = sync_x_pages(
            session,
            source_code,
            x_user_id,
            pages,
            complete=True,
        )
        session.commit()

    return {
        "reservation": reservation,
        "received_posts": received,
        "sync": sync_result,
    }

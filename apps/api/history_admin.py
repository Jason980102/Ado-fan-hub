r"""Local-only CLI for reviewing Ado History events.

Run from apps/api:
    .\.venv\Scripts\python.exe history_admin.py list

No public write endpoint is created.
"""

import argparse
import getpass
import json
import sys
from datetime import date
from urllib.parse import urlsplit

from sqlalchemy import text
from database.session import create_db_engine

EXPECTED_REVISION = "c4e8a2f9d761"

TRANSITIONS = {
    "review": ("draft", "review"),
    "publish": ("review", "published"),
    "unpublish": ("published", "draft"),
}


def parser_for_cli():
    parser = argparse.ArgumentParser(
        description="Local Ado History review administration"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    show = sub.add_parser("show")
    show.add_argument("event_id")

    audit = sub.add_parser("audit")
    audit.add_argument("--event-id", default=None)
    audit.add_argument("--limit", type=int, default=30)

    for action in TRANSITIONS:
        command = sub.add_parser(action)
        command.add_argument("event_id")
        command.add_argument("--reviewer", required=True)
        command.add_argument("--reason", required=True)

        if action == "publish":
            command.add_argument(
                "--confirm-verified",
                action="store_true",
                help="Attest that date, all translations and sources were manually verified",
            )

    return parser


def check_revision(conn):
    revision = conn.execute(
        text("SELECT version_num FROM alembic_version")
    ).scalar_one()

    if revision != EXPECTED_REVISION:
        raise RuntimeError(
            "Unexpected database revision: " + revision
        )


def print_json(value):
    print(json.dumps(
        value,
        ensure_ascii=True,
        indent=2,
        default=str,
    ))


def list_events(conn):
    rows = conn.execute(text("""
        SELECT h.id, h.event_date, h.category, h.status,
               h.title->>'ja' AS title_ja,
               COUNT(s.id) AS sources
        FROM history_events h
        LEFT JOIN history_event_sources s ON s.event_id = h.id
        GROUP BY h.id
        ORDER BY h.event_date, h.id
    """)).mappings().all()

    for row in rows:
        print(
            f"{row['event_date']} | {row['status']:<9} | "
            f"{row['id']:<27} | sources={row['sources']}"
        )

    print(f"Total: {len(rows)}")


def show_event(conn, event_id):
    event = conn.execute(text("""
        SELECT id, event_date, category, status,
               title, summary, details, significance,
               image_url, image_usage_status, image_credit
        FROM history_events
        WHERE id = :id
    """), {"id": event_id}).mappings().one_or_none()

    if event is None:
        raise RuntimeError("History event not found")

    sources = conn.execute(text("""
        SELECT source_url, source_name, source_type
        FROM history_event_sources
        WHERE event_id = :id
        ORDER BY id
    """), {"id": event_id}).mappings().all()

    print_json({
        **dict(event),
        "sources": [dict(row) for row in sources],
    })


def audit_events(conn, event_id, limit):
    if not 1 <= limit <= 200:
        raise RuntimeError("Audit limit must be between 1 and 200")

    rows = conn.execute(text("""
        SELECT id, event_id, action, old_status, new_status,
               reviewer, reason, created_at
        FROM history_review_audit
        WHERE CAST(:event_id AS VARCHAR) IS NULL
           OR event_id = CAST(:event_id AS VARCHAR)
        ORDER BY id DESC
        LIMIT :limit
    """), {
        "event_id": event_id,
        "limit": limit,
    }).mappings().all()

    print_json([dict(row) for row in rows])


def valid_localized(value):
    return (
        isinstance(value, dict)
        and all(
            isinstance(value.get(lang), str)
            and bool(value[lang].strip())
            and "?" * 4 not in value[lang]
            for lang in ("zh", "ja", "en")
        )
    )


def apply_transition(conn, args):
    action = args.command
    old_status, new_status = TRANSITIONS[action]

    reviewer = args.reviewer.strip()
    reason = args.reason.strip()

    if not 1 <= len(reviewer) <= 120:
        raise RuntimeError("Reviewer must contain 1-120 characters")
    if not 10 <= len(reason) <= 2000:
        raise RuntimeError("Reason must contain 10-2000 characters")

    if action == "publish" and not args.confirm_verified:
        raise RuntimeError(
            "Publishing requires --confirm-verified after manual evidence review"
        )

    event = conn.execute(text("""
        SELECT id, event_date, category, status, title, summary
        FROM history_events
        WHERE id = :id
        FOR UPDATE
    """), {"id": args.event_id}).mappings().one_or_none()

    if event is None:
        raise RuntimeError("History event not found")

    if event["status"] != old_status:
        raise RuntimeError(
            f"Invalid transition: {event['status']} -> {new_status}. "
            f"Expected current status: {old_status}"
        )

    if action in ("review", "publish"):
        if not isinstance(event["event_date"], date):
            raise RuntimeError("Invalid history date")

        if event["category"] not in (
            "mv", "album", "concert", "milestone"
        ):
            raise RuntimeError("Invalid event category")

        if not valid_localized(event["title"]):
            raise RuntimeError("Invalid localized titles")

        if not valid_localized(event["summary"]):
            raise RuntimeError("Invalid localized summaries")

        sources = conn.execute(text("""
            SELECT source_url
            FROM history_event_sources
            WHERE event_id = :id
        """), {"id": args.event_id}).scalars().all()

        if not sources:
            raise RuntimeError("Event has no evidence sources")

        for source_url in sources:
            parsed = urlsplit(source_url)
            if parsed.scheme != "https" or not parsed.hostname:
                raise RuntimeError("Invalid evidence source URL")

    if action == "publish":
        print(
            "Manual verification acknowledged. "
            "The tool does not independently fact-check the sources."
        )

    result = conn.execute(text("""
        UPDATE history_events
        SET status = :new_status,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :id AND status = :old_status
    """), {
        "new_status": new_status,
        "old_status": old_status,
        "id": args.event_id,
    })

    if result.rowcount != 1:
        raise RuntimeError("Concurrent modification detected")

    conn.execute(text("""
        INSERT INTO history_review_audit (
            event_id, action, old_status, new_status,
            reviewer, reason
        ) VALUES (
            :event_id, :action, :old_status, :new_status,
            :reviewer, :reason
        )
    """), {
        "event_id": args.event_id,
        "action": action,
        "old_status": old_status,
        "new_status": new_status,
        "reviewer": reviewer,
        "reason": reason,
    })

    print(
        f"PASS: {args.event_id}: "
        f"{old_status} -> {new_status}"
    )
    print("PASS: Audit record inserted in same transaction")


def main():
    parser = parser_for_cli()
    args = parser.parse_args()

    engine = create_db_engine()

    try:
        if args.command in TRANSITIONS:
            with engine.begin() as conn:
                check_revision(conn)
                apply_transition(conn, args)
        else:
            with engine.connect() as conn:
                check_revision(conn)

                if args.command == "list":
                    list_events(conn)
                elif args.command == "show":
                    show_event(conn, args.event_id)
                elif args.command == "audit":
                    audit_events(conn, args.event_id, args.limit)
    finally:
        engine.dispose()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            f"ERROR: {type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)
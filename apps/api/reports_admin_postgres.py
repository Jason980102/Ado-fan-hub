"""Local-only PostgreSQL Reports administration. No public admin API."""

import argparse
import os
import sys

from reports_postgres import (
    STATES,
    admin_list,
    admin_show,
    admin_set_status,
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        required=True,
        choices=["postgres"],
        help="Explicitly confirm the PostgreSQL backend",
    )

    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list", help="Show case IDs and statuses only")

    show = sub.add_parser("show", help="Display private case payload")
    show.add_argument("case_id")

    status = sub.add_parser("status", help="Update a case status")
    status.add_argument("case_id")
    status.add_argument("value", choices=STATES)
    status.add_argument(
        "--confirm",
        action="store_true",
        help="Required before modifying a case",
    )

    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL", "").startswith(
        ("postgresql://", "postgres://")
    ):
        parser.error("PostgreSQL DATABASE_URL is required")

    if args.command == "list":
        for row in admin_list():
            print(row["id"], row["status"])

    elif args.command == "show":
        print(
            "WARNING: Case payload may contain private user information.",
            file=sys.stderr,
        )
        row = admin_show(args.case_id)
        if row is None:
            parser.error("Unknown case")
        print(row["payload"])

    elif args.command == "status":
        if not args.confirm:
            parser.error("Status update requires --confirm")
        changed = admin_set_status(args.case_id, args.value)
        if not changed:
            parser.error("Unknown case")
        print("CASE_STATUS_UPDATED_AND_AUDITED")


if __name__ == "__main__":
    main()
"""Local-only administration. No public moderation endpoint."""
import argparse
import time

from reports_api import STATES, connection, initialize, store_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init", help="Create a NEW reports-only SQLite file; refuses existing files")
    sub.add_parser("list", help="List latest 50 case IDs and states (no report body)")
    show = sub.add_parser("show", help="Read a case locally; may contain private user text")
    show.add_argument("case_id")
    status = sub.add_parser("status")
    status.add_argument("case_id")
    status.add_argument("value", choices=STATES)
    args = parser.parse_args()
    if args.command == "init":
        initialize(store_path())
        print("Reports store initialized. No PostgreSQL migrations were run.")
        return
    with connection() as db, db:
        if args.command == "list":
            for row in db.execute("SELECT id,status FROM reports ORDER BY created_at DESC LIMIT 50"):
                print(row["id"], row["status"])
        elif args.command == "show":
            row = db.execute("SELECT payload FROM reports WHERE id=?", (args.case_id,)).fetchone()
            if not row:
                parser.error("Unknown case")
            print(row["payload"])
        else:
            now = int(time.time())
            if db.execute("UPDATE reports SET status=?,updated_at=? WHERE id=?", (args.value, now, args.case_id)).rowcount != 1:
                parser.error("Unknown case")
            db.execute("INSERT INTO audit VALUES (?,?,?)", (args.case_id, args.value, now))
            print("Case status updated; audit recorded.")


if __name__ == "__main__":
    main()

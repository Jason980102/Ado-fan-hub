import argparse
import json
import os
import sys
from pathlib import Path

from analytics import _configuration, _fetch
from analytics_store import initialize_database, save_channel_snapshot

CONFIG_PATH = Path(__file__).resolve().with_name("analytics.local.json")


def main():
    parser = argparse.ArgumentParser(description="Fetch and save a fresh YouTube snapshot.")
    parser.add_argument("--check", action="store_true",
                        help="Validate local configuration without fetching or saving.")
    args = parser.parse_args()

    try:
        # utf-8-sig also supports files written by Windows PowerShell.
        config = json.loads(CONFIG_PATH.read_text(encoding="utf-8-sig"))
        if not isinstance(config, dict):
            raise ValueError("Invalid configuration")
        for name in ("YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"):
            value = config.get(name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError("Missing configuration")
            os.environ[name] = value.strip()

        # This sync uses the existing playlists, not optional MV overrides.
        os.environ.pop("YOUTUBE_MV_IDS", None)
        api_key, channel_id, video_ids = _configuration()
    except Exception:
        print("ERROR: Local configuration could not be loaded or validated.",
              file=sys.stderr)
        return 1

    if args.check:
        print("OK: Local configuration is valid. No API request or database write.")
        return 0

    try:
        result = _fetch(api_key, channel_id, video_ids)
        if result.cached or result.channel.id != channel_id:
            raise ValueError("Unexpected snapshot")
        initialize_database()
        save_channel_snapshot(result)
    except Exception:
        # Do not print exceptions, request details, or credentials.
        print("ERROR: Snapshot sync failed. No successful sync was reported.",
              file=sys.stderr)
        return 1

    print(f"OK: Fresh snapshot saved at {result.fetched_at.isoformat()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

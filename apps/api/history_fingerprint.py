"""Deterministic content fingerprints for Ado History review."""

import hashlib
import json
from datetime import date, datetime


EVENT_FIELDS = (
    "event_date",
    "category",
    "title",
    "summary",
    "details",
    "significance",
    "image_url",
    "image_source_url",
    "image_credit",
    "image_usage_status",
    "image_alt",
)

SOURCE_FIELDS = (
    "source_url",
    "source_name",
    "source_type",
)


def normalize(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {
            key: normalize(item)
            for key, item in sorted(value.items())
        }
    if isinstance(value, (list, tuple)):
        return [normalize(item) for item in value]
    return value


def content_fingerprint(event, sources):
    """Return a SHA-256 hex digest of review-relevant content."""
    payload = {
        "schema_version": 1,
        "event": {
            field: normalize(event.get(field))
            for field in EVENT_FIELDS
        },
        "sources": sorted(
            [
                {
                    field: normalize(source.get(field))
                    for field in SOURCE_FIELDS
                }
                for source in sources
            ],
            key=lambda item: json.dumps(
                item, sort_keys=True, ensure_ascii=False
            ),
        ),
    }

    serialized = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )

    return hashlib.sha256(
        serialized.encode("utf-8")
    ).hexdigest()
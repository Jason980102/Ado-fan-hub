"""Verified official shop campaign windows.

Unknown campaigns remain browsable but are not eligible for
new wishlist entries until their sales periods are verified.
"""

from datetime import datetime, timedelta, timezone

JST = timezone(timedelta(hours=9))

# Source: https://ado-officialshop-friedpotato.com/shops/Pusheen
# Official product listing: sales end 2026-10-26 23:59 JST.
VERIFIED_WINDOWS = {
    "Pusheen": {
        "end_exclusive": datetime(2026, 10, 27, 0, 0, tzinfo=JST),
        "source_url": "https://ado-officialshop-friedpotato.com/shops/Pusheen",
    },
}


def campaign_info(slug, now=None):
    current = now if now is not None else datetime.now(JST)
    if current.tzinfo is None or current.utcoffset() is None:
        raise ValueError("Campaign time must be timezone-aware")

    verified = VERIFIED_WINDOWS.get(slug)

    if verified is None:
        return {
            "campaign_status": "unverified",
            "wishlist_eligible": False,
            "campaign_ends_at": None,
            "campaign_source_url": None,
        }

    deadline = verified["end_exclusive"]
    active = current < deadline

    return {
        "campaign_status": "active" if active else "ended",
        "wishlist_eligible": active,
        "campaign_ends_at": deadline.isoformat(),
        "campaign_source_url": verified["source_url"],
    }

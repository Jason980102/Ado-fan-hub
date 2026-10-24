"""Validate public original X posts without making API requests."""

from collections.abc import Mapping

ACCOUNTS = {
    "x_ado": "ado1024imokenp",
    "x_staff": "ado_staff",
    "x_fanclub": "ado_doki2kichi",
}

EXCLUDED_REFERENCE_TYPES = frozenset({
    "retweeted",
    "replied_to",
    "quoted",
})


def is_original_post(post: Mapping, expected_author_id: str) -> bool:
    """Allow only original posts by the expected account."""
    post_id = str(post.get("id") or "")
    author_id = str(post.get("author_id") or "")

    if not post_id.isdigit() or not author_id:
        return False

    if author_id != str(expected_author_id):
        return False

    if post.get("in_reply_to_user_id"):
        return False

    if post.get("is_quote_status") is True:
        return False

    if post.get("retweeted_status"):
        return False

    references = post.get("referenced_tweets") or []

    if not isinstance(references, list):
        return False

    for reference in references:
        if not isinstance(reference, Mapping):
            return False
        if reference.get("type") in EXCLUDED_REFERENCE_TYPES:
            return False
        # Unknown relationships are rejected rather than treated as originals.
        if reference.get("type") not in EXCLUDED_REFERENCE_TYPES:
            return False

    return True


def filter_original_posts(posts, expected_author_id: str):
    """Return unique original posts in their incoming order."""
    result = []
    seen_ids = set()

    for post in posts:
        if not isinstance(post, Mapping):
            continue
        if not is_original_post(post, expected_author_id):
            continue

        post_id = str(post["id"])
        if post_id in seen_ids:
            continue

        seen_ids.add(post_id)
        result.append(post)

    return result
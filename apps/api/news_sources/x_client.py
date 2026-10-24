"""Explicit X API v2 timeline client.

No HTTP request occurs during module import.
No retries are performed automatically.
"""

from __future__ import annotations

from collections.abc import Callable

import httpx


X_API_BASE = "https://api.x.com/2"


class XAPIClientError(RuntimeError):
    """A timeline request failed or returned invalid data."""


def fetch_x_timeline_records(
    *,
    bearer_token: str,
    x_user_id: str,
    max_pages: int = 1,
    max_posts: int = 100,
    transport: httpx.BaseTransport | None = None,
) -> list[tuple[str | None, dict]]:
    """Fetch complete timeline pages for one X user.

    The caller is responsible for committing its API budget
    reservation before invoking this function.
    """
    if not isinstance(bearer_token, str) or not bearer_token.strip():
        raise ValueError("Missing X bearer token")

    if not isinstance(x_user_id, str) or not x_user_id.isdigit():
        raise ValueError("Invalid X user ID")

    if type(max_pages) is not int or not 1 <= max_pages <= 20:
        raise ValueError("Invalid max_pages")

    if type(max_posts) is not int or not 1 <= max_posts <= 2000:
        raise ValueError("Invalid max_posts")

    records: list[tuple[str | None, dict]] = []
    token: str | None = None
    seen_tokens: set[str] = set()
    received = 0

    with httpx.Client(
        base_url=X_API_BASE,
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "Accept": "application/json",
        },
        timeout=15.0,
        follow_redirects=False,
        transport=transport,
    ) as client:
        for _ in range(max_pages):
            remaining = max_posts - received

            if remaining < 5:
                raise XAPIClientError(
                    "Insufficient reserved posts for another X page"
                )

            params = {
                "max_results": min(100, remaining),
                "tweet.fields": (
                    "created_at,author_id,referenced_tweets,"
                    "text,attachments"
                ),
                "exclude": "retweets,replies",
            }

            if token is not None:
                params["pagination_token"] = token

            try:
                response = client.get(
                    f"/users/{x_user_id}/tweets",
                    params=params,
                )
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                raise XAPIClientError(
                    "X timeline request failed"
                ) from exc

            if not isinstance(payload, dict):
                raise XAPIClientError("Invalid X API response")

            if payload.get("errors") or payload.get("error"):
                raise XAPIClientError("X API returned errors")

            meta = payload.get("meta")
            if not isinstance(meta, dict):
                raise XAPIClientError("Missing X pagination metadata")

            data = payload.get("data", [])
            if not isinstance(data, list):
                raise XAPIClientError("Invalid X response data")

            if "data" not in payload and meta.get("result_count") != 0:
                raise XAPIClientError("Missing X response data")

            if any(not isinstance(item, dict) for item in data):
                raise XAPIClientError("Invalid X post")

            count = meta.get("result_count")
            if type(count) is not int or count != len(data):
                raise XAPIClientError("Inconsistent result_count")

            records.append((token, payload))
            received += count

            if received > max_posts:
                raise XAPIClientError(
                    "X response exceeded reserved post count"
                )

            next_token = meta.get("next_token")

            if next_token is None:
                return records

            if not isinstance(next_token, str) or not next_token:
                raise XAPIClientError("Invalid pagination token")

            if next_token in seen_tokens:
                raise XAPIClientError("Pagination token cycle")

            seen_tokens.add(next_token)
            token = next_token

    raise XAPIClientError(
        "X pagination exceeded configured page limit"
    )

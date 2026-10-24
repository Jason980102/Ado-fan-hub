"""Offline validation of complete X API v2 pagination.

No HTTP requests, database operations, or API credentials.
"""


class IncompleteXPagination(ValueError):
    pass


def validate_x_pages(records, *, max_pages=20):
    """Validate ordered (requested_token, response) records.

    The first requested token must be None. Each subsequent token
    must match the preceding response's meta.next_token.

    Return pages only if a terminal response was reached.
    """
    if not isinstance(records, (list, tuple)):
        raise IncompleteXPagination("Pagination records must be materialized")

    if not isinstance(max_pages, int) or isinstance(max_pages, bool) or max_pages < 1:
        raise ValueError("Invalid max_pages")

    if not records or len(records) > max_pages:
        raise IncompleteXPagination("No pages or page limit exceeded")

    expected_token = None
    used_tokens = set()
    pages = []

    for requested_token, response in records:
        if requested_token != expected_token:
            raise IncompleteXPagination("Missing or out-of-order page")

        if requested_token is not None:
            if not isinstance(requested_token, str) or not requested_token:
                raise IncompleteXPagination("Invalid requested token")
            if requested_token in used_tokens:
                raise IncompleteXPagination("Repeated pagination token")
            used_tokens.add(requested_token)

        if not isinstance(response, dict):
            raise IncompleteXPagination("Invalid API response")

        if response.get("errors") or response.get("error"):
            raise IncompleteXPagination("API returned errors")

        meta = response.get("meta")
        if not isinstance(meta, dict):
            raise IncompleteXPagination("Missing pagination metadata")

        data = response.get("data", [])
        if not isinstance(data, list):
            raise IncompleteXPagination("Invalid response data")

        if "data" not in response and meta.get("result_count") != 0:
            raise IncompleteXPagination("Missing response data")

        if any(not isinstance(item, dict) for item in data):
            raise IncompleteXPagination("Invalid post in response")

        result_count = meta.get("result_count")
        if type(result_count) is not int or result_count != len(data):
            raise IncompleteXPagination("Inconsistent result count")

        pages.append(data)
        next_token = meta.get("next_token")

        if next_token is None:
            if len(records) != len(pages):
                raise IncompleteXPagination("Unexpected pages after terminal page")
            return pages

        if not isinstance(next_token, str) or not next_token:
            raise IncompleteXPagination("Invalid next_token")

        if next_token in used_tokens:
            raise IncompleteXPagination("Pagination token cycle")

        expected_token = next_token

    raise IncompleteXPagination("Final page still has next_token")

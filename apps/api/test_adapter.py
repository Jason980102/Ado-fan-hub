from datetime import datetime, timezone

from news_sources.universal_music import normalize_official_news


item = normalize_official_news(
    title="Adapter Test Announcement",
    summary="This is test data, not a real Ado announcement.",
    source_url="https://www.universal-music.co.jp/ado/news/",
    published_at=datetime(2026, 10, 17, tzinfo=timezone.utc),
)

assert item.id.startswith("umj-")
assert item.language == "ja"
assert item.source_name == "Universal Music Japan"

print(item.model_dump_json(indent=2))
print("Adapter test passed!")

# Same article with tracking parameters must have the same ID.
same_item = normalize_official_news(
    title="Adapter Test Announcement",
    summary="Test only",
    source_url="https://www.universal-music.co.jp/ado/news/?utm_source=test",
    published_at=datetime(2026, 10, 17, tzinfo=timezone.utc),
)

assert same_item.id == item.id

# An unrelated website must be rejected.
try:
    normalize_official_news(
        title="Invalid source",
        summary="Test only",
        source_url="https://example.com/ado/news/",
        published_at=datetime(2026, 10, 17, tzinfo=timezone.utc),
    )
    raise AssertionError("Invalid URL was accepted")
except ValueError:
    pass

# A datetime without timezone information must be rejected.
try:
    normalize_official_news(
        title="Invalid date",
        summary="Test only",
        source_url="https://www.universal-music.co.jp/ado/news/",
        published_at=datetime(2026, 10, 17),
    )
    raise AssertionError("Naive datetime was accepted")
except ValueError:
    pass

print("Additional validation tests passed!")
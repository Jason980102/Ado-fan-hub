from news_sources.wordpress import fetch_official_news

print("Fetching official Ado news...")

items = fetch_official_news(limit=3)

assert 0 < len(items) <= 3

for item in items:
    print(f"\n[{item.category.value}] {item.published_at.isoformat()}")
    print(item.title)
    print(item.source_url)

print(f"\nLive WordPress Reader test passed! Items: {len(items)}")

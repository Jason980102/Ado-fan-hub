import json

from news_sources.wordpress import parse_post


with open(
    "research/wp-posts-details.json",
    encoding="utf-8"
) as file:
    posts = json.load(file)

items = [parse_post(post) for post in posts]

assert len(items) == 3
assert all(item.source_name == "Universal Music Japan" for item in items)
assert all(item.published_at.tzinfo is not None for item in items)
assert all(item.title for item in items)

for item in items:
    print(f"[{item.category.value}] {item.published_at.isoformat()}")
    print(item.title)
    print(item.source_url)
    print()

print("WordPress Reader test passed!")

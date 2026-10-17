import json

from news_sources.wordpress import extract_first_image

with open(
    "research/wp-image-details.json",
    encoding="utf-8"
) as file:
    posts = json.load(file)

found = 0

for post in posts:
    image_url = extract_first_image(
        post.get("content", {}).get("rendered", "")
    )

    print(f"\nPost ID: {post['id']}")
    print(f"Image: {image_url or 'No image'}")

    if image_url:
        found += 1

assert found == 3, f"Expected 3 images, found {found}"

assert extract_first_image(
    '<img src="https://example.com/untrusted.jpg">'
) is None

assert extract_first_image("") is None

print("\nNews image extraction test passed!")

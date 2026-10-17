import json
from urllib.request import urlopen

url = "http://127.0.0.1:8000/api/news?limit=3"

with urlopen(url, timeout=10) as response:
    data = json.load(response)

for item in data["items"]:
    print(item["title"])
    print(item["source_url"])
    print()

print("Total:", data["total"])

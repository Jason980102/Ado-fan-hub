"""Discover campaign artwork from public official homepage widgets."""
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import re

BASE = 'https://ado-officialshop-friedpotato.com'


def theme_key(value):
    if not isinstance(value, str):
        return None
    parsed = urlsplit(urljoin(BASE, value))
    if parsed.scheme != 'https' or parsed.hostname != 'ado-officialshop-friedpotato.com':
        return None
    match = re.fullmatch(r'/shops/([A-Za-z0-9_-]{1,80})/?', parsed.path)
    return match[1] if match else None


class ImageLinks(HTMLParser):
    def __init__(self, validate_image):
        super().__init__(convert_charrefs=True)
        self.validate_image = validate_image
        self.current = None
        self.images = {}

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == 'a':
            self.current = theme_key(fields.get('href'))
        if tag == 'img' and self.current:
            image = self.validate_image(fields.get('src') or fields.get('data-src'))
            if image:
                self.images[self.current] = image

    def handle_endtag(self, tag):
        if tag == 'a':
            self.current = None


def collect_images(value, validate_image):
    found = {}
    if isinstance(value, dict):
        key = next((theme_key(value.get(field)) for field in ['url', 'linkUrl', 'href', 'link'] if theme_key(value.get(field))), None)
        picture = next((validate_image(value.get(field)) for field in ['imageUrl', 'src', 'image_url'] if validate_image(value.get(field))), None)
        if key and picture:
            found[key] = picture
        for child in value.values():
            found.update(collect_images(child, validate_image))
    elif isinstance(value, list):
        for child in value:
            found.update(collect_images(child, validate_image))
    elif isinstance(value, str) and '<img' in value.lower():
        parser = ImageLinks(validate_image)
        parser.feed(value)
        found.update(parser.images)
    return found


def discover_visuals(read_public, validate_image):
    data = read_public('/theme_page_positions/search?theme_page_type=1')
    ids = list(dict.fromkeys(widget['widgetId']
        for position in data['_embedded']['themePagePositions']
        for widget in position.get('widgetThemePagePositions', [])
        if type(widget.get('widgetId')) is int and widget['widgetId'] > 0))[:12]

    def read_widget(widget_id):
        try:
            return collect_images(read_public(f'/widgets/{widget_id}'), validate_image)
        except Exception:
            return {}

    result = {}
    with ThreadPoolExecutor(max_workers=4) as pool:
        for images in pool.map(read_widget, ids):
            result.update(images)
    return result

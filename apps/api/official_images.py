"""Images from five fixed public official pages. No credentials or arbitrary URLs."""
from dataclasses import dataclass
from html.parser import HTMLParser
from threading import Lock
from time import monotonic
from typing import Literal
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import APIRouter, HTTPException, Response

router = APIRouter(prefix='/api/official-images', tags=['Official images'])
Source = Literal['x', 'instagram', 'niconico', 'member', 'shop']
PAGES = {
    'x': 'https://x.com/ado1024imokenp',
    'instagram': 'https://www.instagram.com/ado1024sweetpotet/',
    'niconico': 'https://www.nicovideo.jp/user/39170211',
    'member': 'https://ado-dokidokihimitsukichi-daigakuimo.com/',
    'shop': 'https://ado-officialshop-friedpotato.com/',
}
PAGE_HOSTS = {
    'x': {'x.com', 'www.x.com'},
    'instagram': {'instagram.com', 'www.instagram.com'},
    'niconico': {'www.nicovideo.jp', 'nicovideo.jp'},
    'member': {'ado-dokidokihimitsukichi-daigakuimo.com'},
    'shop': {'ado-officialshop-friedpotato.com'},
}
MAX_BYTES = 2_000_000
TTL_SECONDS = 6 * 3600

class Metadata(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.images = []
        self.icons = []
        self.title = ''

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == 'meta':
            key = (fields.get('property') or fields.get('name') or '').lower()
            value = fields.get('content') or ''
            if key in {'og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'} and value:
                self.images.append(value)
            elif key == 'og:title':
                self.title = value
        elif tag == 'link' and 'icon' in (fields.get('rel') or '').lower():
            if fields.get('href'):
                self.icons.append(fields['href'])

def allowed_url(source, url, image=False):
    try:
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
            return False
        host = (parsed.hostname or '').lower()
        if not image:
            return host in PAGE_HOSTS[source]
        if source == 'x':
            return host == 'pbs.twimg.com' and parsed.path.startswith('/profile_images/')
        if source == 'instagram':
            return host.endswith('.cdninstagram.com') and '-19/' in parsed.path
        if source == 'niconico':
            return host == 'img.nicoprofile.nimg.jp' and parsed.path.startswith('/usericon/') and '/39170211.' in parsed.path
        if source == 'member':
            return (host in PAGE_HOSTS[source] or (
                host == 'cdn.ado-dokidokihimitsukichi-daigakuimo.com'
                and parsed.path == '/public_html/site_design/fanclub_designs/21956/logo_image_path'
            ))
        if source == 'shop':
            return host == 'images.groobee.com' and parsed.path.startswith('/images/ado-officialshop/')
    except (ValueError, KeyError):
        pass
    return False

class CheckedRedirect(HTTPRedirectHandler):
    def __init__(self, source, image):
        self.source = source
        self.image = image

    def redirect_request(self, request, fp, code, message, headers, newurl):
        if not allowed_url(self.source, newurl, self.image):
            raise ValueError('Unexpected redirect')
        return super().redirect_request(request, fp, code, message, headers, newurl)

def read_public(source, url, image=False):
    if not allowed_url(source, url, image):
        raise ValueError('Unexpected source')
    request = Request(url, headers={
        'User-Agent': 'AdoFanHub/0.2 PublicMetadataCheck',
        'Accept': 'image/png,image/jpeg,image/webp,image/svg+xml' if image else 'text/html',
    })
    opener = build_opener(CheckedRedirect(source, image))
    with opener.open(request, timeout=12) as response:
        if not allowed_url(source, response.geturl(), image):
            raise ValueError('Unexpected final source')
        body = response.read(MAX_BYTES + 1)
        if not body or len(body) > MAX_BYTES:
            raise ValueError('Unexpected response size')
        return body, response.headers.get_content_type(), response.headers.get_content_charset() or 'utf-8'

def candidates(source, html):
    metadata = Metadata()
    metadata.feed(html)
    title = metadata.title.casefold()
    if source == 'x' and 'ado1024imokenp' not in title:
        raise ValueError('Profile identity unavailable')
    if source == 'instagram' and 'ado1024sweetpotet' not in title:
        raise ValueError('Profile identity unavailable')
    if source == 'member':
        # The site's favicon is entirely transparent. Use its public header logo.
        return ['https://cdn.ado-dokidokihimitsukichi-daigakuimo.com/public_html/site_design/fanclub_designs/21956/logo_image_path?height=192']
    values = metadata.images + (metadata.icons if source == 'shop' else [])
    result = []
    for value in values:
        # Preserve signed CDN query strings; never print them or send them to the client.
        url = urljoin(PAGES[source], value)
        if allowed_url(source, url, True) and url not in result:
            if urlsplit(url).path.lower().endswith(('.ico', '.svg')):
                continue
            result.append(url)
    return result[:3]

def normalize_svg(body):
    from xml.etree import ElementTree as ET
    import re
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Unsupported SVG declarations')
    root = ET.fromstring(body)
    if root.tag.split('}')[-1] != 'svg':
        raise ValueError('Invalid SVG root')
    for node in root.iter():
        if node.tag.split('}')[-1].lower() in {'script', 'foreignobject'}:
            raise ValueError('Unsupported SVG content')
        for key, value in node.attrib.items():
            name = key.split('}')[-1].lower()
            if name.startswith('on') or (name == 'href' and not value.startswith('#')):
                raise ValueError('Unsupported SVG reference')
            if 'url(' in value.lower() and not re.fullmatch(r"url\(\s*['\"]?#[\w.-]+['\"]?\s*\)", value):
                raise ValueError('Unsupported SVG resource')
    if 'viewBox' not in root.attrib:
        width = re.fullmatch(r'(\d+(?:\.\d+)?)(?:px)?', root.get('width', ''))
        height = re.fullmatch(r'(\d+(?:\.\d+)?)(?:px)?', root.get('height', ''))
        if not width or not height:
            raise ValueError('SVG dimensions unavailable')
        root.set('viewBox', f'0 0 {width[1]} {height[1]}')
    ET.register_namespace('', 'http://www.w3.org/2000/svg')
    return ET.tostring(root, encoding='utf-8')

def valid_image(body, media_type):
    if media_type == 'image/svg+xml':
        try:
            normalize_svg(body)
            return True
        except Exception:
            return False
    if media_type == 'image/png':
        return body.startswith(b'\x89PNG\r\n\x1a\n')
    if media_type == 'image/jpeg':
        return body.startswith(b'\xff\xd8\xff')
    if media_type == 'image/webp':
        return body.startswith(b'RIFF') and body[8:12] == b'WEBP'
    return False

def fetch_image(source):
    html, media_type, charset = read_public(source, PAGES[source])
    if media_type not in {'text/html', 'application/xhtml+xml'}:
        raise ValueError('Unexpected page type')
    for url in candidates(source, html.decode(charset, errors='replace')):
        try:
            body, media_type, _ = read_public(source, url, True)
            if source == 'member' and media_type == 'image/svg+xml':
                body = normalize_svg(body)
            if valid_image(body, media_type):
                return body, media_type
        except Exception:
            continue
    raise ValueError('No available image')

@dataclass
class CacheEntry:
    image: tuple[bytes, str] | None = None
    expires: float = 0
    retry_after: float = 0

_cache = {source: CacheEntry() for source in PAGES}
_locks = {source: Lock() for source in PAGES}

@router.get('/{source}')
def official_image(source: Source):
    with _locks[source]:
        entry = _cache[source]
        now = monotonic()
        if now >= entry.expires and now >= entry.retry_after:
            try:
                entry.image = fetch_image(source)
                entry.expires = monotonic() + TTL_SECONDS
                entry.retry_after = 0
            except Exception:
                # Keep a previously successful image and throttle failed retries.
                entry.retry_after = monotonic() + 300
        if entry.image is None:
            raise HTTPException(status_code=503, detail='Official image temporarily unavailable') from None
        body, media_type = entry.image
        fresh = monotonic() < entry.expires
        return Response(content=body, media_type=media_type, headers={
            'Cache-Control': 'public, max-age=3600' if fresh else 'public, max-age=60',
            'X-Content-Type-Options': 'nosniff',
        })

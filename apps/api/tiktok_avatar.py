"""Best-effort Ado TikTok avatar with persistent last-known-good cache."""

import base64
import json
import os
import time
from html.parser import HTMLParser
from pathlib import Path
from threading import Lock
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from fastapi import APIRouter, HTTPException, Response

router = APIRouter(tags=["Official images"])

PROFILE = "https://www.tiktok.com/@ado1024osenbei"
USERNAME = "ado1024osenbei"
TTL = 24 * 60 * 60
RETRY_DELAY = 60 * 60
MAX_HTML = 5_000_000
MAX_IMAGE = 2_000_000

CACHE_PATH = (
    Path.home() / ".cache" / "ado-fan-hub" / "tiktok-avatar.json"
)
_lock = Lock()
_memory = None
_checked = 0.0


class ProfileScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.collecting = False
        self.parts = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        if tag != "script":
            return
        fields = dict(attrs)
        self.collecting = fields.get("id") in {
            "__UNIVERSAL_DATA_FOR_REHYDRATION__",
            "SIGI_STATE",
        }
        self.parts = []

    def handle_data(self, data):
        if self.collecting:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self.collecting:
            self.scripts.append("".join(self.parts))
            self.collecting = False
            self.parts = []


def allowed(url, image=False):
    try:
        p = urlsplit(url)
        if (p.scheme != "https" or p.username or p.password
                or p.port not in (None, 443)):
            return False
        host = (p.hostname or "").lower()
        if not image:
            return host == "www.tiktok.com"
        cdn = (
            host.endswith(".tiktokcdn.com")
            or host.endswith(".tiktokcdn-us.com")
        )
        return cdn and (
            "/tos-avt-" in p.path
            or p.path.startswith("/tos-alisg-avt-0068/")
        )
    except ValueError:
        return False


class SafeRedirects(HTTPRedirectHandler):
    def __init__(self, image):
        self.image = image

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed(newurl, self.image):
            raise ValueError("Unexpected redirect")
        return super().redirect_request(
            req, fp, code, msg, headers, newurl
        )


def download(url, image=False):
    if not allowed(url, image):
        raise ValueError("Unexpected URL")

    req = Request(url, headers={
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 Chrome/125.0 Safari/537.36"
        ),
        "Accept": (
            "image/avif,image/webp,image/png,image/jpeg,*/*"
            if image else "text/html"
        ),
    })
    opener = build_opener(SafeRedirects(image))
    limit = MAX_IMAGE if image else MAX_HTML

    with opener.open(req, timeout=12) as response:
        if not allowed(response.geturl(), image):
            raise ValueError("Unexpected final URL")
        body = response.read(limit + 1)
        media = response.headers.get_content_type()

    if not body or len(body) > limit:
        raise ValueError("Unexpected download size")
    return body, media


def avatar_urls(html):
    parser = ProfileScripts()
    parser.feed(html)

    for script in parser.scripts:
        try:
            data = json.loads(script)
        except (ValueError, TypeError):
            continue

        scope = data.get("__DEFAULT_SCOPE__", data)
        detail = scope.get("webapp.user-detail", {})
        info = detail.get("userInfo", detail)
        user = info.get("user", {})

        if str(user.get("uniqueId", "")).lower() != USERNAME:
            continue

        result = []
        for key in ("avatarLarger", "avatarMedium", "avatarThumb"):
            url = user.get(key)
            if isinstance(url, str) and allowed(url, image=True):
                if url not in result:
                    result.append(url)
        if result:
            return result

    raise ValueError("Verified TikTok profile avatar unavailable")


def valid_image(body, media):
    return (
        (media == "image/jpeg" and body.startswith(b"\xff\xd8\xff"))
        or (media == "image/png" and
            body.startswith(b"\x89PNG\r\n\x1a\n"))
        or (media == "image/webp" and
            body.startswith(b"RIFF") and body[8:12] == b"WEBP")
    )


def fetch_current():
    html, media = download(PROFILE)
    if media not in ("text/html", "application/xhtml+xml"):
        raise ValueError("Unexpected profile page")

    for url in avatar_urls(html.decode("utf-8", errors="replace")):
        try:
            body, kind = download(url, image=True)
            if valid_image(body, kind):
                return body, kind
        except Exception:
            continue

    raise ValueError("No usable TikTok avatar")


def load_cache():
    try:
        data = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        body = base64.b64decode(data["image"], validate=True)
        media = data["media"]
        fetched = float(data["fetched_at"])
        if len(body) <= MAX_IMAGE and valid_image(body, media):
            return body, media, fetched
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None


def save_cache(body, media, fetched):
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "image": base64.b64encode(body).decode("ascii"),
        "media": media,
        "fetched_at": fetched,
    }
    temporary = CACHE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload), encoding="utf-8")
    os.replace(temporary, CACHE_PATH)


@router.get("/api/official-images/tiktok")
def tiktok_avatar():
    global _memory, _checked

    with _lock:
        if _memory is None:
            _memory = load_cache()

        now = time.time()
        expired = _memory is None or now - _memory[2] >= TTL

        if expired and now - _checked >= RETRY_DELAY:
            _checked = now
            try:
                body, media = fetch_current()
                _memory = (body, media, time.time())
                try:
                    save_cache(*_memory)
                except OSError:
                    # Keep serving the verified image in memory.
                    pass
            except Exception:
                # Preserve the last verified image, including disk cache.
                pass

        if _memory is None:
            raise HTTPException(
                status_code=503,
                detail="TikTok avatar temporarily unavailable",
            )

        body, media, fetched = _memory
        fresh = time.time() - fetched < TTL

        return Response(
            content=body,
            media_type=media,
            headers={
                "Cache-Control": (
                    "public, max-age=3600"
                    if fresh else "public, max-age=60"
                ),
                "X-Content-Type-Options": "nosniff",
            },
        )

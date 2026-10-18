"""Public shop catalogue only; no authentication, cart or checkout operations."""
from datetime import datetime, timezone
from threading import Lock
from time import monotonic
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
import json
import re
from fastapi import APIRouter, HTTPException, Query
from shop_campaigns import campaign_info
from shop_state import remember_themes

router = APIRouter(prefix='/api/shop', tags=['Official shop catalogue'])
API = 'https://shop.api.groobee.com'
OFFICIAL = 'https://ado-officialshop-friedpotato.com'
SOURCE = 'Ado Official Shop'
PAGE_SIZE = 24
_cache = {}
_lock = Lock()


class FixedRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, url):
        raise ValueError('Catalogue redirects are unsupported')


def read_public(path):
    request = Request(API + path, headers={'Accept': 'application/json',
        'User-Agent': 'AdoFanHub/0.3 PublicCatalog', 'X-Bet-Site-Code': 'ado-officialshop'})
    with build_opener(FixedRedirect()).open(request, timeout=15) as response:
        body = response.read(2_000_001)
        if len(body) > 2_000_000:
            raise ValueError('Catalogue response too large')
        return json.loads(body)


def text(value, maximum=1000):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ValueError('Invalid catalogue text')
    return value.strip()


def slug(value):
    value = text(value, 80)
    if not re.fullmatch(r'[A-Za-z0-9_-]+', value):
        raise ValueError('Invalid catalogue identifier')
    return value


def positive(value):
    if type(value) is not int or value < 0:
        raise ValueError('Invalid catalogue number')
    return value


def image_url(value):
    if not isinstance(value, str):
        return None
    p = urlsplit(value)
    return value if (p.scheme == 'https' and p.hostname == 'images.groobee.com'
        and not p.username and not p.password and p.port in (None, 443)
        and p.path.startswith('/images/ado-officialshop/')) else None


def fetch_themes():
    values = read_public('/shops/search')['_embedded']['shops']
    if not isinstance(values, list) or len(values) > 200:
        raise ValueError('Invalid theme list')
    from shop_visuals import discover_visuals
    try:
        visuals = discover_visuals(read_public, image_url)
    except Exception:
        visuals = {}
    result = []
    seen = set()
    for value in values:
        key = slug(value['slug'])
        if key in seen:
            continue
        seen.add(key)
        picture = visuals.get(key)
        kind = 'campaign' if picture else 'none'
        if not picture:
            try:
                preview = read_public('/products/search?' + urlencode({'shop_id': positive(value['id']), 'per_page': 1, 'current_page': 1}))
                entries = preview.get('_embedded', {}).get('products', [])
                picture = image_url(entries[0].get('imageUrl')) if entries else None
                kind = 'product_preview' if picture else 'none'
            except Exception:
                pass
        result.append({'id': positive(value['id']), 'slug': key, 'title': text(value['name']),
            'image_url': picture, 'visual_kind': kind, 'url': OFFICIAL + '/shops/' + key})
    return {'themes': result}


def product(value):
    key = slug(value['slug'])
    labels = [text(label['name'], 120) for label in value.get('labels', [])[:20]]
    state = ('ended' if value.get('isSalesEnd') is True else
             'sold_out' if value.get('isSoldOut') is True else
             'upcoming' if value.get('isBeforeLaunch') is True else
             'available' if value.get('isAvailable') is True else 'unknown')
    return {'slug': key, 'title': text(value['name']), 'price_jpy': positive(value['price']),
        'image_url': image_url(value.get('imageUrl')), 'status': state, 'labels': labels,
        'url': OFFICIAL + '/products/' + key}


def fetch_products(theme_id, page):
    response = read_public('/products/search?' + urlencode({'shop_id': theme_id,
        'per_page': PAGE_SIZE, 'current_page': page}))
    total = positive(response['total'])
    values = response['_embedded']['products']
    if not isinstance(values, list) or len(values) > PAGE_SIZE:
        raise ValueError('Invalid product list')
    return {'products': [product(value) for value in values], 'total': total,
        'page': page, 'has_more': page * PAGE_SIZE < total and bool(values)}


def cached(key, fetch):
    with _lock:
        now = monotonic()
        old = _cache.get(key)
        if old and now < old['expires']:
            return {**old['value'], 'cached': True, 'stale': old['stale']}
        try:
            data = fetch()
            result = {**data, 'source': SOURCE, 'checked_at': datetime.now(timezone.utc).isoformat()}
            if key not in _cache and len(_cache) >= 128:
                del _cache[next(iter(_cache))]
            _cache[key] = {'value': result, 'expires': monotonic() + 600, 'stale': False}
            return {**result, 'cached': False, 'stale': False}
        except Exception:
            if old:
                old['expires'] = monotonic() + 60
                old['stale'] = True
                return {**old['value'], 'cached': True, 'stale': True}
            raise HTTPException(503, 'Official catalogue is temporarily unavailable') from None


@router.get('/themes')
def themes():
    result = cached('themes', fetch_themes)
    return {
        **result,
        'themes': [
            {**theme, **campaign_info(theme['slug'])}
            for theme in remember_themes(result['themes'])
        ],
    }


@router.get('/themes/{theme_slug}/products')
def products(theme_slug: str, page: int = Query(1, ge=1, le=200)):
    entries = themes()
    theme = next((theme for theme in entries['themes'] if theme['slug'] == theme_slug), None)
    if theme is None:
        raise HTTPException(404, 'Unknown official theme')
    result = cached((theme['id'], page), lambda: fetch_products(theme['id'], page))
    return {**result, 'theme': theme, 'stale': result['stale'] or entries['stale']}


def fetch_product_options(key):
    detail = read_public('/products/' + key)
    definitions = read_public('/products/' + key + '/specifications')

    detail_embedded = detail.get('_embedded', {})
    specs_embedded = definitions.get('_embedded', {})

    if not isinstance(detail_embedded, dict) or not isinstance(specs_embedded, dict):
        raise ValueError('Invalid product metadata')

    raw_specs = specs_embedded.get('specifications')
    raw_combinations = detail_embedded.get('validCombinations')

    if not isinstance(raw_specs, list) or len(raw_specs) > 5:
        raise ValueError('Invalid specifications')

    if not isinstance(raw_combinations, list) or len(raw_combinations) > 200:
        raise ValueError('Invalid combinations')

    specifications = []
    groups = []
    seen_ids = set()

    for spec in raw_specs:
        spec_id = positive(spec['id'])
        if spec_id == 0:
            raise ValueError('Invalid specification ID')

        values = spec.get('specificationValues')
        if not isinstance(values, list) or len(values) > 100:
            raise ValueError('Invalid specification values')

        parsed_values = []
        ids = set()

        for value in values:
            value_id = positive(value['id'])
            if value_id == 0 or value_id in seen_ids:
                raise ValueError('Invalid or duplicate value ID')

            seen_ids.add(value_id)
            ids.add(value_id)

            parsed_values.append({
                'id': value_id,
                'name': text(value['name'], 120),
            })

        specifications.append({
            'id': spec_id,
            'name': text(spec['name'], 120),
            'values': parsed_values,
        })
        groups.append(ids)

    combinations = []
    seen_combinations = set()

    for combination in raw_combinations:
        if not isinstance(combination, list) or len(combination) != len(groups):
            raise ValueError('Invalid combination structure')

        ids = tuple(positive(value_id) for value_id in combination)

        if any(value_id not in groups[i] for i, value_id in enumerate(ids)):
            raise ValueError('Unknown combination value')

        if ids not in seen_combinations:
            seen_combinations.add(ids)
            combinations.append(list(ids))

    raw_limit = detail.get('saleUpperLimit')

    if raw_limit is not None and (
        type(raw_limit) is not int or raw_limit < 0
    ):
        raise ValueError('Invalid product purchase limit')

    sale_upper_limit = raw_limit

    return {
        'slug': key,
        'has_options': bool(specifications),
        'specifications': specifications,
        'valid_combinations': combinations,
        'sale_upper_limit': sale_upper_limit,
    }


@router.get('/products/{product_slug}/options')
def product_options(product_slug: str):
    try:
        key = slug(product_slug)
    except ValueError:
        raise HTTPException(400, 'Invalid product identifier') from None

    return cached(
        ('product-options', key),
        lambda: fetch_product_options(key),
    )


@router.get('/products/{product_slug}/variation')
def selected_variation(
    product_slug: str,
    value_ids: str = Query(..., min_length=1, max_length=80),
):
    try:
        key = slug(product_slug)
    except ValueError:
        raise HTTPException(400, 'Invalid product identifier') from None

    parts = value_ids.split(',')

    if (
        not 1 <= len(parts) <= 5
        or any(not re.fullmatch(r'[1-9][0-9]{0,11}', part) for part in parts)
    ):
        raise HTTPException(400, 'Invalid specification values')

    selected_ids = [int(part) for part in parts]

    options = product_options(key)

    if options['stale']:
        raise HTTPException(
            503,
            'Current product specifications are unavailable',
        )

    if selected_ids not in options['valid_combinations']:
        raise HTTPException(
            400,
            'Invalid specification combination',
        )

    params = urlencode([
        (f'product_specification_value_ids[{index}]', value_id)
        for index, value_id in enumerate(selected_ids)
    ])

    try:
        data = read_public(
            '/products/' + key + '/variations/find?' + params
        )

        variation_id = positive(data['id'])
        has_stock = data['hasStock']
        upper_limit = data.get('upperLimit')

        if variation_id == 0 or type(has_stock) is not bool:
            raise ValueError('Invalid variation data')

        if upper_limit is not None:
            upper_limit = positive(upper_limit)

    except Exception:
        raise HTTPException(
            503,
            'Official variation data is temporarily unavailable',
        ) from None

    return {
        'slug': key,
        'value_ids': selected_ids,
        'variation_id': variation_id,
        'has_stock': has_stock,
        'upper_limit': upper_limit,
        'source': SOURCE,
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'cached': False,
        'stale': False,
    }

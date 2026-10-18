"""Public, shared catalogue observations; never infer restock from stale data."""
from datetime import datetime, timezone
from threading import Lock
from time import monotonic

from fastapi import APIRouter, HTTPException, Query

import shop_catalog
from shop_campaigns import campaign_info

router = APIRouter(prefix='/api/shop', tags=['Merchandise status'])
_lock = Lock()
_snapshot = None
_expires = 0


def stock_snapshot():
    global _snapshot, _expires
    with _lock:
        if _snapshot is not None and monotonic() < _expires:
            return {**_snapshot, 'cached': True}
        try:
            themes = shop_catalog.themes()
            entries = []
            stale = themes['stale']
            current = datetime.now(timezone.utc)
            observations = [themes.get('checked_at', current.isoformat())]
            for theme in themes['themes']:
                if not theme['wishlist_eligible']:
                    continue
                seen = set()
                for page in range(1, 201):
                    result = shop_catalog.products(theme['slug'], page)
                    observations.append(result.get('checked_at', current.isoformat()))
                    stale = stale or result['stale']
                    for product in result['products']:
                        if product['slug'] not in seen:
                            seen.add(product['slug'])
                            entries.append({'theme': result['theme'], 'product': product})
                    if not result['has_more']:
                        break
                else:
                    raise ValueError('Incomplete active catalogue')
            oldest = min(datetime.fromisoformat(value) for value in observations)
            _snapshot = {'items': entries, 'stale': stale,
                         'checked_at': oldest.isoformat(),
                         'source': shop_catalog.SOURCE}
            # Nested caches must not turn a ten-minute source TTL into twenty.
            age = (datetime.now(timezone.utc) - oldest).total_seconds()
            _expires = monotonic() + (60 if stale else max(1, min(600, 600 - age)))
        except Exception:
            if _snapshot is None:
                raise HTTPException(503, 'Current merchandise unavailable') from None
            _snapshot = {**_snapshot, 'stale': True}
            _expires = monotonic() + 60
        return {**_snapshot, 'cached': False}


def active_entries(snapshot):
    # Campaign expiry applies immediately, even when stock is cached.
    return [entry for entry in snapshot['items']
            if campaign_info(entry['theme']['slug'])['wishlist_eligible']]


@router.get('/sold-out')
def sold_out(page: int = Query(1, ge=1, le=200)):
    snapshot = stock_snapshot()
    items = [entry for entry in active_entries(snapshot) if entry['product']['status'] == 'sold_out']
    start = (page - 1) * 24
    return {**snapshot, 'items': items[start:start + 24], 'total': len(items),
            'page': page, 'has_more': start + 24 < len(items)}


@router.get('/campaign-status')
def campaign_status(slugs: str = Query(..., min_length=1, max_length=16200)):
    values = slugs.split(',')
    if len(values) > 200 or len(set(values)) != len(values):
        raise HTTPException(400, 'Invalid campaign list')
    try:
        values = [shop_catalog.slug(value) for value in values]
    except ValueError:
        raise HTTPException(400, 'Invalid campaign identifier') from None
    # This route deliberately works for campaigns no longer listed upstream.
    return {'campaigns': [{'slug': value, **campaign_info(value)} for value in values]}

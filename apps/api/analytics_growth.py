"""Read-only seven-day comparisons from PostgreSQL snapshots."""
from datetime import datetime, timedelta
import os
import re
from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from analytics_store import C, V, iso
from database.session import create_db_engine

router = APIRouter(prefix='/api/analytics', tags=['Analytics'])


def comparison(rows, fields):
    if not rows:
        return None
    latest = rows[-1]
    target = datetime.fromisoformat(latest['fetched_at']) - timedelta(days=7)
    before = [row for row in rows if datetime.fromisoformat(row['fetched_at']) <= target]
    first = before[-1] if before else rows[0]
    return {
        'from': first['fetched_at'], 'to': latest['fetched_at'],
        'partial': not bool(before),
        'changes': {key: None if first['fetched_at'] == latest['fetched_at']
                    or first[key] is None or latest[key] is None
                    else latest[key] - first[key] for key in fields},
    }


def _read_growth(db, channel_id):
    empty = {'channel_id': channel_id, 'channel': None, 'mv_period': None, 'videos': [], 'excluded': 0}

    def boundary(table, aggregate, upper=None):
        query = select(aggregate(table.c.fetched_at)).where(table.c.channel_id == channel_id)
        if upper is not None:
            query = query.where(table.c.fetched_at <= upper)
        return db.scalar(query)

    latest = boundary(C, func.max)
    if latest is None:
        return empty
    target = latest - timedelta(days=7)
    baseline = boundary(C, func.max, target)
    channel_rows = [dict(row) for row in db.execute(select(C).where(
        C.c.channel_id == channel_id, C.c.fetched_at >= (baseline or target))
        .order_by(C.c.fetched_at)).mappings()]
    for row in channel_rows:
        row['fetched_at'] = iso(row['fetched_at'])
    channel = comparison(channel_rows, ['subscriber_count', 'view_count', 'video_count'])
    mv_latest = boundary(V, func.max)
    if mv_latest is None:
        return {**empty, 'channel': channel}
    mv_first = boundary(V, func.max, mv_latest - timedelta(days=7))
    partial = mv_first is None
    if mv_first is None:
        mv_first = boundary(V, func.min)
    first = V.alias('first')
    rows = db.execute(select(V, first.c.view_count.label('baseline_views')).select_from(
        V.outerjoin(first, (first.c.channel_id == V.c.channel_id)
                    & (first.c.video_id == V.c.video_id) & (first.c.fetched_at == mv_first)))
        .where(V.c.channel_id == channel_id, V.c.fetched_at == mv_latest)).mappings().all()
    videos = []
    for row in rows:
        if mv_first == mv_latest or row['baseline_views'] is None or row['view_count'] is None:
            continue
        videos.append({'id': row['video_id'], 'title': row['title'], 'thumbnail_url': row['thumbnail_url'],
                       'view_count': row['view_count'], 'delta': row['view_count'] - row['baseline_views']})
    videos.sort(key=lambda item: (-item['delta'], item['id']))
    return {'channel_id': channel_id, 'channel': channel,
            'mv_period': {'from': iso(mv_first), 'to': iso(mv_latest), 'partial': partial},
            'videos': videos[:10], 'excluded': len(rows) - len(videos)}


def read_growth(channel_id):
    engine = create_db_engine()
    try:
        # A concurrent sync must not split the channel/video comparison across snapshots.
        with engine.connect().execution_options(isolation_level='REPEATABLE READ',
                                                 postgresql_readonly=True) as db:
            with db.begin():
                return _read_growth(db, channel_id)
    finally:
        engine.dispose()


@router.get('/youtube/growth')
def youtube_growth():
    channel_id = os.environ.get('YOUTUBE_CHANNEL_ID', '').strip()
    if not re.fullmatch(r'UC[A-Za-z0-9_-]{22}', channel_id):
        raise HTTPException(503, 'YouTube channel configuration is invalid')
    try:
        return read_growth(channel_id)
    except (SQLAlchemyError, OSError, ValueError, RuntimeError):
        raise HTTPException(503, 'Growth history is temporarily unavailable') from None

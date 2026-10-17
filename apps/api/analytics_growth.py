"""Read-only seven-day comparisons from locally recorded snapshots."""
from datetime import datetime, timedelta
import os
import re
import sqlite3
from fastapi import APIRouter, HTTPException
from analytics_store import initialize_database, _connect

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


def read_growth(channel_id):
    initialize_database()
    db = _connect()
    try:
        # Keep all reads on the same database snapshot, including a concurrent sync.
        db.execute('BEGIN')
        latest = db.execute('SELECT MAX(fetched_at) FROM channel_snapshots WHERE channel_id=?', (channel_id,)).fetchone()[0]
        if latest is None:
            return {'channel_id': channel_id, 'channel': None, 'mv_period': None, 'videos': [], 'excluded': 0}
        target = (datetime.fromisoformat(latest) - timedelta(days=7)).isoformat()
        # One observation preceding the boundary plus the observed seven-day window.
        baseline = db.execute('SELECT MAX(fetched_at) FROM channel_snapshots WHERE channel_id=? AND fetched_at<=?', (channel_id, target)).fetchone()[0]
        channel_rows = db.execute('SELECT * FROM channel_snapshots WHERE channel_id=? AND fetched_at>=? ORDER BY fetched_at', (channel_id, baseline or target)).fetchall()
        channel = comparison(channel_rows, ['subscriber_count', 'view_count', 'video_count'])
        mv_latest = db.execute('SELECT MAX(fetched_at) FROM video_snapshots WHERE channel_id=?', (channel_id,)).fetchone()[0]
        if not mv_latest:
            return {'channel_id': channel_id, 'channel': channel, 'mv_period': None, 'videos': [], 'excluded': 0}
        mv_target = (datetime.fromisoformat(mv_latest) - timedelta(days=7)).isoformat()
        mv_first = db.execute('SELECT MAX(fetched_at) FROM video_snapshots WHERE channel_id=? AND fetched_at<=?', (channel_id, mv_target)).fetchone()[0]
        partial = mv_first is None
        if mv_first is None:
            mv_first = db.execute('SELECT MIN(fetched_at) FROM video_snapshots WHERE channel_id=?', (channel_id,)).fetchone()[0]
        rows = db.execute('''SELECT last.*, first.view_count AS baseline_views
            FROM video_snapshots AS last LEFT JOIN video_snapshots AS first
            ON first.channel_id=last.channel_id AND first.video_id=last.video_id AND first.fetched_at=?
            WHERE last.channel_id=? AND last.fetched_at=?''', (mv_first, channel_id, mv_latest)).fetchall()
        videos = []
        for row in rows:
            if mv_first == mv_latest or row['baseline_views'] is None or row['view_count'] is None:
                continue
            videos.append({'id': row['video_id'], 'title': row['title'], 'thumbnail_url': row['thumbnail_url'],
                           'view_count': row['view_count'], 'delta': row['view_count'] - row['baseline_views']})
        videos.sort(key=lambda item: (-item['delta'], item['id']))
        return {'channel_id': channel_id, 'channel': channel,
                'mv_period': {'from': mv_first, 'to': mv_latest, 'partial': partial},
                'videos': videos[:10], 'excluded': len(rows) - len(videos)}
    finally:
        db.close()


@router.get('/youtube/growth')
def youtube_growth():
    channel_id = os.environ.get('YOUTUBE_CHANNEL_ID', '').strip()
    if not re.fullmatch(r'UC[A-Za-z0-9_-]{22}', channel_id):
        raise HTTPException(503, 'YouTube channel configuration is invalid')
    try:
        return read_growth(channel_id)
    except (sqlite3.Error, OSError, ValueError):
        raise HTTPException(503, 'Growth history is temporarily unavailable') from None

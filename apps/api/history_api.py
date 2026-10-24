"""Read-only public Ado History API."""

from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from database.session import create_db_engine

router = APIRouter(prefix="/api/history", tags=["History"])

Category = Literal["mv", "concert", "album", "milestone"]


@lru_cache(maxsize=1)
def _engine():
    return create_db_engine()


@router.get("/events")
def list_history_events(
    response: Response,
    year: int | None = Query(default=None, ge=2000, le=2100),
    category: Category | None = None,
):
    response.headers["Cache-Control"] = "no-store"
    # Deliberately expose published entries only.
    statement = text("""
        SELECT
            h.id,
            h.event_date,
            h.category,
            h.title,
            h.summary,
            h.details,
            h.significance,
            CASE
                WHEN h.image_usage_status = 'approved'
                THEN h.image_url
                ELSE NULL
            END AS image_url,
            CASE
                WHEN h.image_usage_status = 'approved'
                THEN h.image_alt
                ELSE '{}'::jsonb
            END AS image_alt,
            (
                SELECT s.source_url
                FROM history_event_sources s
                WHERE s.event_id = h.id
                ORDER BY s.id
                LIMIT 1
            ) AS source_url
        FROM history_events h
        WHERE h.status = 'published'
          AND (
            CAST(:year AS INTEGER) IS NULL
            OR EXTRACT(YEAR FROM h.event_date) = CAST(:year AS INTEGER)
          )
          AND (
            CAST(:category AS VARCHAR) IS NULL
            OR h.category = CAST(:category AS VARCHAR)
          )
        ORDER BY h.event_date DESC, h.id
        LIMIT 500
    """)

    try:
        with _engine().connect() as connection:
            rows = connection.execute(
                statement,
                {"year": year, "category": category},
            ).mappings().all()
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="History data is temporarily unavailable",
        )

    events = []
    for row in rows:
        events.append({
            "id": row["id"],
            "date": row["event_date"].isoformat(),
            "category": row["category"],
            "title": row["title"],
            "summary": row["summary"],
            "details": row["details"],
            "significance": row["significance"],
            "image_url": row["image_url"],
            "image_alt": row["image_alt"],
            "source_url": row["source_url"],
        })

    return {"events": events, "total": len(events)}
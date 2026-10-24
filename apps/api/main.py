from shop_stock import router as shop_stock_router
from shop_push import RestockWorker, router as shop_push_router
from fx_rates import FxWorker, router as fx_rates_router
from mv_catalog import router as mv_catalog_router
from official_curated_api import router as official_curated_router
from shop_catalog import router as shop_catalog_router
from analytics_growth import router as analytics_growth_router
from tiktok_avatar import router as tiktok_avatar_router
from official_images import router as official_images_router
from analytics import router as analytics_router
from history_api import router as history_router
from reports_api import router as reports_router
from reports_body_limit import ReportsBodyLimit
import os
from typing import Annotated, Literal
from contextlib import asynccontextmanager

from mv_sync import MVSyncScheduler
from mv_incremental import sync_recent_feed
from mv_playlists import sync_official_playlists
from mv_uploads import sync_full_uploads

from fastapi import FastAPI, HTTPException, Query

from models import NewsCategory, NewsListResponse
from services.news_service import list_cached_news
from fastapi.middleware.cors import CORSMiddleware

@asynccontextmanager
async def mv_lifespan(app):
    scheduler = MVSyncScheduler(
        {
            "feed": (60, sync_recent_feed),
            "playlists": (900, sync_official_playlists),
            "uploads": (21600, sync_full_uploads),
        },
        start_delayed=True,
    )

    demo_mode = os.environ.get("ADO_DEMO_MODE") == "1"
    app.state.mv_sync = None

    fx_worker = None
    restock_worker = None

    if not demo_mode:
        app.state.mv_sync = scheduler
        scheduler.start()

        fx_worker = FxWorker()
        fx_worker.start()

        restock_worker = RestockWorker()
        restock_worker.start()

    try:
        yield
    finally:
        if restock_worker is not None:
            restock_worker.stop()
        if fx_worker is not None:
            fx_worker.stop()
        if app.state.mv_sync is not None:
            scheduler.stop()
        app.state.mv_sync = None


app = FastAPI(
    title="Ado Fan Hub API",
    version="0.2.0",
    description="Backend API for the unofficial Ado Fan Hub.",
    lifespan=mv_lifespan,
)

app.add_middleware(ReportsBodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip().rstrip("/")
        for origin in os.environ.get("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ] + [
        "http://localhost:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
        "http://192.168.4.27:8081",
        "http://192.168.4.27:8082",
    ],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Accept", "Content-Type", "Authorization"],
)


@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "ok",
        "service": "ado-fan-hub-api",
    }


@app.get(
    "/api/news",
    response_model=NewsListResponse,
    tags=["News"],
)
def list_news(
    category: NewsCategory | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    source: Literal[
        "all",
        "x",
        "x_staff",
        "x_ado",
        "x_fanclub",
        "instagram",
        "fanclub",
        "fanclub_shop",
        "official_shop",
        "youtube",
        "universal",
    ] = "all",
    q: Annotated[str, Query(max_length=100)] = "",
):
    try:
        if source == "all" and (q.strip() or category is not None):
            from services.all_news_search import search_all_news
            return search_all_news(
                category=category,
                limit=limit,
                offset=offset,
                query=q,
            )

        if source == "youtube":
            from services.youtube_news_catalog import list_youtube_catalog
            return list_youtube_catalog(
                category=category,
                limit=limit,
                offset=offset,
                query=q,
            )

        from services.news_service import search_news_titles
        if q.strip() or source in (
            "youtube", "x", "x_staff", "x_ado", "x_fanclub"
        ):
            return search_news_titles(
                category=category, limit=limit, offset=offset,
                source=source, query=q,
            )
        return list_cached_news(
            category=category,
            limit=limit,
            offset=offset,
            source=source,
        )
    except Exception:
        # Do not expose upstream URLs or internal errors to clients.
        raise HTTPException(
            status_code=503,
            detail="News source temporarily unavailable",
        ) from None

app.include_router(fx_rates_router)
app.include_router(analytics_router)
app.include_router(history_router)
app.include_router(reports_router)
app.include_router(analytics_growth_router)
app.include_router(tiktok_avatar_router)
app.include_router(official_images_router)
app.include_router(shop_catalog_router)
app.include_router(shop_stock_router)
app.include_router(shop_push_router)

app.include_router(mv_catalog_router)
app.include_router(official_curated_router)


@app.get("/api/mv/sync-status", tags=["MV catalog"])
def mv_sync_status():
    scheduler = getattr(app.state, "mv_sync", None)

    if scheduler is None:
        return {"running": False, "jobs": {}}

    return scheduler.status()

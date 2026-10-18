from shop_stock import router as shop_stock_router
from shop_push import RestockWorker, router as shop_push_router
from fx_rates import FxWorker, router as fx_rates_router
from mv_catalog import router as mv_catalog_router
from shop_catalog import router as shop_catalog_router
from analytics_growth import router as analytics_growth_router
from tiktok_avatar import router as tiktok_avatar_router
from official_images import router as official_images_router
from analytics import router as analytics_router
from typing import Annotated
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

    app.state.mv_sync = scheduler
    scheduler.start()
    fx_worker = FxWorker()
    fx_worker.start()
    restock_worker = RestockWorker()
    restock_worker.start()

    try:
        yield
    finally:
        restock_worker.stop()
        fx_worker.stop()
        scheduler.stop()
        app.state.mv_sync = None


app = FastAPI(
    title="Ado Fan Hub API",
    version="0.2.0",
    description="Backend API for the unofficial Ado Fan Hub.",
    lifespan=mv_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8081",
        "http://localhost:8082",
        "http://127.0.0.1:8081",
        "http://127.0.0.1:8082",
        "http://192.168.4.27:8081",
        "http://192.168.4.27:8082",
    ],
    allow_methods=["GET", "PUT", "DELETE"],
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
):
    try:
        return list_cached_news(
            category=category,
            limit=limit,
            offset=offset,
        )
    except Exception:
        # Do not expose upstream URLs or internal errors to clients.
        raise HTTPException(
            status_code=503,
            detail="News source temporarily unavailable",
        ) from None

app.include_router(fx_rates_router)
app.include_router(analytics_router)
app.include_router(analytics_growth_router)
app.include_router(tiktok_avatar_router)
app.include_router(official_images_router)
app.include_router(shop_catalog_router)
app.include_router(shop_stock_router)
app.include_router(shop_push_router)

app.include_router(mv_catalog_router)


@app.get("/api/mv/sync-status", tags=["MV catalog"])
def mv_sync_status():
    scheduler = getattr(app.state, "mv_sync", None)

    if scheduler is None:
        return {"running": False, "jobs": {}}

    return scheduler.status()

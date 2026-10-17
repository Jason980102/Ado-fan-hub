from analytics_growth import router as analytics_growth_router
from official_images import router as official_images_router
from analytics import router as analytics_router
from typing import Annotated

from fastapi import FastAPI, HTTPException, Query

from models import NewsCategory, NewsListResponse
from services.news_service import list_cached_news
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Ado Fan Hub API",
    version="0.2.0",
    description="Backend API for the unofficial Ado Fan Hub.",
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
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
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

app.include_router(analytics_router)
app.include_router(analytics_growth_router)
app.include_router(official_images_router)

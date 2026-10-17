from typing import Annotated

from fastapi import FastAPI, Query

from models import NewsCategory, NewsListResponse


app = FastAPI(
    title="Ado Fan Hub API",
    version="0.1.0",
    description="Backend API for the unofficial Ado Fan Hub.",
)


@app.get("/health", tags=["System"])
def health_check():
    return {
        "status": "ok",
        "service": "ado-fan-hub-api",
    }


@app.get("/api/news", response_model=NewsListResponse, tags=["News"])
def list_news(
    category: NewsCategory | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    # Official news sources have not been integrated yet.
    return NewsListResponse(items=[], total=0)
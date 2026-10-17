from datetime import datetime
from enum import Enum

from pydantic import BaseModel, HttpUrl


class NewsCategory(str, Enum):
    OFFICIAL = "official"
    CONCERT = "concert"
    MERCH = "merch"
    MEDIA = "media"


class NewsItem(BaseModel):
    id: str
    title: str
    summary: str
    category: NewsCategory
    source_name: str
    source_url: HttpUrl
    published_at: datetime
    language: str


class NewsListResponse(BaseModel):
    items: list[NewsItem]
    total: int

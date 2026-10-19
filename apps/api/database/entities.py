"""Shared persistent data models for Ado Fan Hub."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger, Boolean, DateTime, ForeignKey, Index,
    Integer, String, Text, UniqueConstraint, Uuid, func
)
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    display_name: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active",
        server_default="active"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AuthIdentity(Base):
    __tablename__ = "auth_identities"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_subject: Mapped[str] = mapped_column(
        String(255), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "provider", "provider_subject",
            name="uq_auth_provider_subject"
        ),
    )


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )
    language: Mapped[str] = mapped_column(
        String(20), server_default="en"
    )
    time_zone: Mapped[str] = mapped_column(
        String(80), server_default="UTC"
    )
    notifications_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default="false"
    )


class NewsSource(Base):
    __tablename__ = "news_sources"

    code: Mapped[str] = mapped_column(String(40), primary_key=True)
    display_name: Mapped[str] = mapped_column(
        String(120), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, server_default="true"
    )


class NewsArticle(Base):
    __tablename__ = "news_articles"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    source_code: Mapped[str] = mapped_column(
        String(40), ForeignKey("news_sources.code"),
        nullable=False
    )
    external_id: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    title: Mapped[str] = mapped_column(String(1000), nullable=False)
    summary: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=""
    )
    category: Mapped[str] = mapped_column(
        String(40), nullable=False
    )
    language: Mapped[str] = mapped_column(
        String(12), server_default="ja"
    )
    access_level: Mapped[str] = mapped_column(
        String(30), server_default="public"
    )
    source_url: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    image_url: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "source_code", "external_id",
            name="uq_news_source_external"
        ),
        Index(
            "ix_news_published_id",
            published_at.desc(), id.desc()
        ),
    )


class MusicVideo(Base):
    __tablename__ = "music_videos"

    youtube_id: Mapped[str] = mapped_column(
        String(32), primary_key=True
    )
    title: Mapped[str] = mapped_column(
        String(1000), nullable=False
    )
    channel_id: Mapped[str | None] = mapped_column(String(100))
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    source: Mapped[str] = mapped_column(
        String(60), nullable=False
    )
    external_id: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    title: Mapped[str] = mapped_column(
        String(1000), nullable=False
    )
    source_url: Mapped[str | None] = mapped_column(Text)
    price_jpy: Mapped[int | None] = mapped_column(BigInteger)

    __table_args__ = (
        UniqueConstraint(
            "source", "external_id",
            name="uq_product_source_external"
        ),
    )


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id"),
        nullable=False
    )
    quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id", "product_id",
            name="uq_wishlist_user_product"
        ),
    )


class NewsSyncState(Base):
    __tablename__ = "news_sync_state"

    source_code: Mapped[str] = mapped_column(
        String(40),
        ForeignKey("news_sources.code"),
        primary_key=True,
    )
    next_offset: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    upstream_total: Mapped[int | None] = mapped_column(Integer)
    last_success_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    last_error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

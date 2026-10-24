"""Shared SQLAlchemy connection configuration."""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker


def get_database_url():
    configured = os.environ.get("DATABASE_URL")
    if configured:
        if configured.startswith("postgresql://"):
            return "postgresql+psycopg://" + configured[len("postgresql://"):]
        if configured.startswith("postgres://"):
            return "postgresql+psycopg://" + configured[len("postgres://"):]
        return configured

    # Local development only. Production supplies DATABASE_URL.
    env_path = Path(__file__).resolve().parents[3] / ".env.db.local"

    if not env_path.is_file():
        raise RuntimeError("DATABASE_URL is not configured")

    settings = {}

    for line in env_path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            settings[key.strip()] = value.strip()

    password = settings.get("POSTGRES_PASSWORD")

    if not password:
        raise RuntimeError("PostgreSQL development password missing")

    return URL.create(
        "postgresql+psycopg",
        username="ado_app",
        password=password,
        host="127.0.0.1",
        port=5433,
        database="ado_fan_hub",
    )


def create_db_engine():
    return create_engine(
        get_database_url(),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
    )


def create_session_factory(engine):
    return sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
    )

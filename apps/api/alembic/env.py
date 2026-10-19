"""Alembic configuration for Ado Fan Hub PostgreSQL."""

from alembic import context
from sqlalchemy.engine import URL

from database.base import Base
from database import entities  # noqa: F401
from database.session import create_db_engine, get_database_url

config = context.config
target_metadata = Base.metadata


def run_migrations_offline():
    url = get_database_url()

    if isinstance(url, URL):
        url = url.render_as_string(hide_password=False)

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = create_db_engine()

    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

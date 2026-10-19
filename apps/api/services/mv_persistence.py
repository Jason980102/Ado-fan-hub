"""Canonical persistence entry point for MV catalog updates.

PostgreSQL is the only authoritative database.
The legacy SQLite snapshot is not written here.
"""

from mv_catalog import CatalogResponse
from services.mv_catalog_writer import save_catalog_to_db


def persist_mv_catalog(catalog: CatalogResponse) -> int:
    """Persist a complete catalog before publishing it to API cache.

    Raises on database failure. Callers must not publish a failed
    catalog as a successfully synchronized result.
    """
    if not isinstance(catalog, CatalogResponse):
        raise TypeError("Expected CatalogResponse")

    if catalog.partial or not catalog.videos:
        raise ValueError("Complete non-empty MV catalog required")

    return save_catalog_to_db(catalog)

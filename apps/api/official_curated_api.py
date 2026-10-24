"""Read-only API for Ado's curated third-party covers."""

from fastapi import APIRouter, HTTPException

from services.official_curated_playlist import CuratedPlaylist
from services.official_curated_snapshot import load_curated_snapshot

router = APIRouter(prefix="/api/mv", tags=["MV catalog"])


@router.get("/official-picks", response_model=CuratedPlaylist)
def official_picks():
    """Serve curated creators from a published local snapshot only."""
    try:
        return load_curated_snapshot()
    except RuntimeError:
        raise HTTPException(
            status_code=503,
            detail="Official picks temporarily unavailable",
        ) from None

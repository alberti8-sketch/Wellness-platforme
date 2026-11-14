"""Commune contours for the map (public reference data, no tenant data involved)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from config import Principal
from geo import commune_contours
from security import get_principal

router = APIRouter(prefix="/api/geo", tags=["geo"])


@router.get("/communes")
def communes(codes: str = Query(..., max_length=2000, description="Codes INSEE séparés par des virgules"),
             _: Principal = Depends(get_principal)) -> dict:
    wanted = [c.strip().upper() for c in codes.split(",") if c.strip()][:200]
    return commune_contours(wanted)

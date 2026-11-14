"""Public context data around territories: pathology trends and food environment."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status

from config import Principal
from external_data import PATHOLOGIES, food_environment, pathology_trends
from security import get_principal

router = APIRouter(prefix="/api", tags=["context"])


def _codes(raw: str) -> list[str]:
    codes = [c.strip().upper() for c in raw.split(",") if c.strip()]
    if not codes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Au moins un code territoire est requis.")
    return list(dict.fromkeys(codes))  # dedupe, keep order


@router.get("/trends/pathologies")
def trends(territories: str = Query(..., max_length=1000, description="Codes INSEE séparés par des virgules"),
           patho: str = Query("diabete", description=" | ".join(PATHOLOGIES)),
           _: Principal = Depends(get_principal)) -> dict:
    if patho not in PATHOLOGIES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pathologie inconnue : {patho} (attendu : {', '.join(PATHOLOGIES)})")
    return pathology_trends(_codes(territories), patho)


@router.get("/food-environment")
def food(territories: str = Query(..., max_length=1000, description="Codes communes INSEE séparés par des virgules"),
         include_points: bool = False, _: Principal = Depends(get_principal)) -> dict:
    return food_environment(_codes(territories), include_points)

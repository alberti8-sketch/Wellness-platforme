"""Commune-level domain map: walkability, cycling, food environment, sport, health care."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

import commune_domains
from config import Principal
from ml_tree import DatasetMissing
from security import get_principal

router = APIRouter(prefix="/api/communes", tags=["communes"])


@router.get("/domaines")
def domaines(_: Principal = Depends(get_principal)) -> dict[str, Any]:
    """All metropolitan communes of 2,000+ inhabitants, in a compact columns / rows layout."""
    try:
        data = commune_domains.load()
    except DatasetMissing as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {
        "year": 2024,
        "indicators": commune_domains.INDICATORS,
        "walk_classes": commune_domains.WALK_CLASSES,
        "sport_rate": {"source": commune_domains.SOURCES["injep"], "by_size": commune_domains.SPORT_RATE_2023},
        **data,
    }

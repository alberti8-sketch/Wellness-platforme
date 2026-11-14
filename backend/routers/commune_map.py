"""Commune-level domain map: walkability, cycling, food environment, sport, health care."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

import commune_domains
from config import Principal
from ml_tree import DatasetMissing
from security import get_principal

router = APIRouter(prefix="/api/communes", tags=["communes"])


@router.get("/domaines")
def domaines(
    codes: str | None = Query(None, max_length=2000, description="Codes INSEE (sinon toutes les communes)"),
    _: Principal = Depends(get_principal),
) -> dict[str, Any]:
    """Metropolitan communes of 2,000+ inhabitants (plus the tracked cities), compact columns / rows layout."""
    try:
        data = commune_domains.load()
    except DatasetMissing as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {
        "year": 2024,
        "indicators": commune_domains.INDICATORS,
        "walk_classes": commune_domains.WALK_CLASSES,
        "sport_rate": {"source": commune_domains.SOURCES["injep"], "by_size": commune_domains.SPORT_RATE_2023},
        "columns": data["columns"],
        "rows": _filter(data, codes),
    }


def _filter(data: dict[str, Any], codes: str | None) -> list[list[Any]]:
    if not codes:
        return data["rows"]
    wanted = {c.strip().upper() for c in codes.split(",") if c.strip()}
    i = data["columns"].index("code")
    return [r for r in data["rows"] if r[i] in wanted]

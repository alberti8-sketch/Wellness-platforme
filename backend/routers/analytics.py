"""Analytics layer: only PUBLISHED data of the caller's tenant is ever exposed."""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Principal
from db import get_db
from models import Dataset, DimensionScore, Observation, TerritoryContext
from pipeline.catalog import BANDS, CONTEXT_COLUMNS, DIMENSIONS, INDICATORS, TERRITORY_TYPES, default_weights
from pipeline.orchestrator import State
from pipeline.scoring import composite
from schemas import CellOut, DimensionOut
from security import get_principal

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


class ContextOut(BaseModel):
    level: str | None = None
    territory_type: str | None = None
    population: float | None = None
    density_km2: float | None = None
    source_global_score: float | None = None


class TerritoryOut(BaseModel):
    code: str
    name: str
    period: int
    context: ContextOut = ContextOut()
    dataset_id: str
    published_at: datetime | None
    composite: DimensionOut
    dimensions: dict[str, DimensionOut]
    indicators: dict[str, CellOut]


class Overview(BaseModel):
    periods: list[int]
    period: int | None
    weights: dict[str, float]
    territories: list[TerritoryOut]
    band_counts: dict[str, int]
    average: float | None


def parse_weights(raw: str | None) -> dict[str, float]:
    weights = default_weights()
    if not raw:
        return weights
    for part in raw.split(","):
        try:
            code, value = part.split(":")
            code = code.strip().upper()
            if code not in DIMENSIONS:
                raise ValueError
            weights[code] = max(0.0, float(value))
        except ValueError:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pondération invalide : « {part} »") from None
    return weights


@router.get("/catalog")
def catalog(_: Principal = Depends(get_principal)) -> dict:
    return {
        "dimensions": [d.__dict__ for d in DIMENSIONS.values()],
        "indicators": [{**i.__dict__, "direction": i.direction.value} for i in INDICATORS.values()],
        "bands": [{"code": c, "label": lbl, "min": lo} for c, lbl, lo in BANDS],
        "context_columns": CONTEXT_COLUMNS,
        "territory_types": list(TERRITORY_TYPES),
    }


def build_overview(db: Session, principal: Principal, period: int | None, weights: dict[str, float],
                   territories: set[str] | None = None, territory_type: str | None = None) -> Overview:
    tid = principal.tenant.id
    published = {
        d.id: d
        for d in db.scalars(select(Dataset).where(Dataset.tenant_id == tid, Dataset.status == State.PUBLISHED))
    }
    if not published:
        return Overview(periods=[], period=None, weights=weights, territories=[], band_counts={}, average=None)

    dims = db.scalars(select(DimensionScore).where(DimensionScore.tenant_id == tid,
                                                   DimensionScore.dataset_id.in_(published))).all()
    periods = sorted({d.period for d in dims})
    target = period if period in periods else (periods[-1] if periods else None)

    # Latest published dataset wins for each territory of the target period.
    latest: dict[str, Dataset] = {}
    for d in dims:
        if d.period != target or (territories and d.territory_code not in territories):
            continue
        ds = published[d.dataset_id]
        cur = latest.get(d.territory_code)
        if cur is None or (ds.published_at, ds.id) > (cur.published_at, cur.id):
            latest[d.territory_code] = ds

    obs = db.scalars(select(Observation).where(
        Observation.tenant_id == tid,
        Observation.period == target,
        Observation.dataset_id.in_({ds.id for ds in latest.values()}),
    )).all()

    out: dict[str, TerritoryOut] = {}
    for d in dims:
        ds = latest.get(d.territory_code)
        if ds is None or d.dataset_id != ds.id or d.period != target:
            continue
        t = out.setdefault(d.territory_code, TerritoryOut(
            code=d.territory_code, name=d.territory_name, period=d.period, dataset_id=ds.id,
            published_at=ds.published_at, composite=DimensionOut(score=None, band=None, coverage=0),
            dimensions={}, indicators={}))
        t.dimensions[d.dimension] = DimensionOut(score=d.score, band=d.band, coverage=d.coverage)
    for o in obs:
        t = out.get(o.territory_code)
        if t is not None and latest[o.territory_code].id == o.dataset_id:
            t.indicators[o.indicator_code] = CellOut(raw_value=o.raw_value, score=o.score, band=o.band,
                                                     flags=o.flags or [])
    ctxs = db.scalars(select(TerritoryContext).where(
        TerritoryContext.tenant_id == tid,
        TerritoryContext.period == target,
        TerritoryContext.dataset_id.in_({ds.id for ds in latest.values()}),
    )).all()
    for c in ctxs:
        t = out.get(c.territory_code)
        if t is not None and latest[c.territory_code].id == c.dataset_id:
            t.context = ContextOut(level=c.level, territory_type=c.territory_type, population=c.population,
                                   density_km2=c.density_km2, source_global_score=c.source_global_score)
    if territory_type:
        out = {k: t for k, t in out.items() if t.context.territory_type == territory_type}
    for t in out.values():
        res = composite({k: v.score for k, v in t.dimensions.items()}, weights)
        t.composite = DimensionOut(score=res.score, band=res.band, coverage=res.coverage)

    items = sorted(out.values(), key=lambda t: (-(t.composite.score or 0), t.code))
    counts = {code: 0 for code, _, _ in BANDS}
    for t in items:
        if t.composite.band:
            counts[t.composite.band] += 1
    scored = [t.composite.score for t in items if t.composite.score is not None]
    return Overview(periods=periods, period=target, weights=weights, territories=items, band_counts=counts,
                    average=round(sum(scored) / len(scored), 2) if scored else None)


def _type_filter(raw: str | None) -> str | None:
    if not raw:
        return None
    if raw not in TERRITORY_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Typologie inconnue : {raw}")
    return raw


def _territory_filter(raw: str | None) -> set[str] | None:
    return {c.strip().upper() for c in raw.split(",") if c.strip()} if raw else None


@router.get("/overview", response_model=Overview)
def overview(period: int | None = None, weights: str | None = None,
             territories: str | None = Query(None, description="Codes séparés par des virgules"),
             territory_type: str | None = Query(None, description="urbain | semi-urbain | rural"),
             principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> Overview:
    return build_overview(db, principal, period, parse_weights(weights), _territory_filter(territories),
                          _type_filter(territory_type))


@router.get("/export.csv")
def export_csv(period: int | None = None, weights: str | None = None, territories: str | None = None,
               territory_type: str | None = None,
               principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> Response:
    ov = build_overview(db, principal, period, parse_weights(weights), _territory_filter(territories),
                        _type_filter(territory_type))
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    header = ["code", "territoire", "periode", "typologie", "population", "densite_km2", "score_global_source",
              "indice_global", "classe", "couverture"]
    header += [f"score_{d}" for d in DIMENSIONS]
    for code in INDICATORS:
        header += [f"{code}_brut", f"{code}_score"]
    w.writerow(header)
    for t in ov.territories:
        c = t.context
        line = [t.code, t.name, t.period, c.territory_type, c.population, c.density_km2, c.source_global_score,
                t.composite.score, t.composite.band, t.composite.coverage]
        line += [t.dimensions.get(d).score if t.dimensions.get(d) else None for d in DIMENSIONS]
        for code in INDICATORS:
            c = t.indicators.get(code)
            line += [c.raw_value if c else None, c.score if c else None]
        w.writerow(["" if v is None else v for v in line])
    w.writerow([])
    w.writerow(["ponderation"] + [f"{k}={v:g}" for k, v in ov.weights.items()])
    content = "﻿" + buf.getvalue()  # BOM so Excel opens UTF-8 correctly
    return Response(content, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="wellness_{ov.period or "na"}.csv"'})

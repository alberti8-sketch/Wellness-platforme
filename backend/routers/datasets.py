"""Processing hub: pipeline status, inspection table, admin override & approval."""

from __future__ import annotations

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Principal, Role
from db import get_db
from models import Dataset, DimensionScore, Observation
from pipeline.catalog import INDICATORS
from pipeline.orchestrator import PIPELINE_STATES, PipelineError, TransitionError, override_value, review
from pipeline.validation import Issue
from schemas import (
    CellOut,
    DatasetDetail,
    DatasetSummary,
    DimensionOut,
    EventOut,
    OverrideIn,
    ReviewIn,
    TableRow,
)
from security import get_principal, require

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


def to_summary(ds: Dataset) -> DatasetSummary:
    errors = sum(1 for i in ds.issues or [] if i.get("severity") == "error")
    return DatasetSummary.model_validate(ds).model_copy(
        update={"error_count": errors, "warning_count": len(ds.issues or []) - errors}
    )


def get_owned_dataset(db: Session, dataset_id: str, principal: Principal) -> Dataset:
    """Fetch a dataset ONLY within the caller's tenant. Other tenants' ids answer 404 (no existence leak)."""
    ds = db.scalar(select(Dataset).where(Dataset.id == dataset_id, Dataset.tenant_id == principal.tenant.id))
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jeu de données introuvable.")
    return ds


@router.get("", response_model=list[DatasetSummary])
def list_datasets(principal: Principal = Depends(get_principal), db: Session = Depends(get_db)) -> list[DatasetSummary]:
    rows = db.scalars(
        select(Dataset).where(Dataset.tenant_id == principal.tenant.id).order_by(Dataset.created_at.desc())
    ).all()
    return [to_summary(d) for d in rows]


@router.get("/{dataset_id}", response_model=DatasetDetail)
def dataset_detail(dataset_id: str, principal: Principal = Depends(get_principal),
                   db: Session = Depends(get_db)) -> DatasetDetail:
    ds = get_owned_dataset(db, dataset_id, principal)
    tid = principal.tenant.id
    obs = db.scalars(select(Observation).where(Observation.dataset_id == ds.id, Observation.tenant_id == tid)).all()
    dims = db.scalars(select(DimensionScore).where(DimensionScore.dataset_id == ds.id,
                                                   DimensionScore.tenant_id == tid)).all()

    table: dict[tuple[str, int], TableRow] = {}
    for o in obs:
        key = (o.territory_code, o.period)
        row = table.setdefault(key, TableRow(source_row=o.source_row, territory_code=o.territory_code,
                                             territory_name=o.territory_name, period=o.period,
                                             cells={}, dimensions={}))
        row.cells[o.indicator_code] = CellOut(raw_value=o.raw_value, score=o.score, band=o.band, flags=o.flags or [])
    dim_map: dict[tuple[str, int], dict[str, DimensionOut]] = defaultdict(dict)
    for d in dims:
        dim_map[(d.territory_code, d.period)][d.dimension] = DimensionOut(score=d.score, band=d.band,
                                                                          coverage=d.coverage)
    for key, row in table.items():
        row.dimensions = dim_map.get(key, {})

    summary = to_summary(ds)
    return DatasetDetail(
        **summary.model_dump(),
        events=[EventOut.model_validate(e) for e in ds.events],
        issues=[Issue.model_validate(i) for i in ds.issues or []],
        table=sorted(table.values(), key=lambda r: (r.territory_code, r.period)),
        pipeline_states=[s.value for s in PIPELINE_STATES],
    )


def _guard(fn):
    try:
        return fn()
    except (TransitionError, PipelineError) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc


@router.post("/{dataset_id}/approve", response_model=DatasetSummary)
def approve(dataset_id: str, body: ReviewIn, principal: Principal = Depends(require(Role.ADMIN)),
            db: Session = Depends(get_db)) -> DatasetSummary:
    ds = get_owned_dataset(db, dataset_id, principal)
    return to_summary(_guard(lambda: review(db, ds, principal, True, body.comment)))


@router.post("/{dataset_id}/reject", response_model=DatasetSummary)
def reject(dataset_id: str, body: ReviewIn, principal: Principal = Depends(require(Role.ADMIN)),
           db: Session = Depends(get_db)) -> DatasetSummary:
    ds = get_owned_dataset(db, dataset_id, principal)
    return to_summary(_guard(lambda: review(db, ds, principal, False, body.comment)))


@router.post("/{dataset_id}/override", response_model=DatasetSummary)
def override(dataset_id: str, body: OverrideIn, principal: Principal = Depends(require(Role.ADMIN)),
             db: Session = Depends(get_db)) -> DatasetSummary:
    if body.column not in INDICATORS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Indicateur inconnu : {body.column}")
    ds = get_owned_dataset(db, dataset_id, principal)
    return to_summary(_guard(lambda: override_value(db, ds, principal, row=body.row, column=body.column,
                                                    value=body.value, reason=body.reason)))

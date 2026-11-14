"""Deterministic ingestion pipeline — an explicit finite-state machine.

    RECEIVED ─► VALIDATED ─► CLEANED ─► NORMALIZED ─► AGGREGATED ─► PENDING_APPROVAL ─► PUBLISHED
        │           │           │            │             │               │  └────────► REJECTED
        └───────────┴───────────┴────────────┴─────────────┴──► FAILED     └─(override)─► RECEIVED

Guarantees:
  * Steps are plain functions executed in a fixed order (`PLAN`); there is no
    autonomous agent, no LLM call and no randomness. Same input ⇒ same output.
  * Every transition is checked against `TRANSITIONS` and written to an
    append-only audit trail (`dataset_events`).
  * Tenant isolation: a run operates on ONE dataset of ONE tenant. Every record
    produced is stamped with that tenant id and checked by `_guard_segregation`
    before it is persisted; a mismatch aborts the run.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

import pandas as pd
from sqlalchemy import delete
from sqlalchemy.orm import Session

from config import Principal, Tenant, tenant_by_id
from models import Dataset, DatasetEvent, DimensionScore, Observation

from .catalog import DIMENSIONS, INDICATORS
from .scoring import aggregate_dimension, band, normalize
from .validation import Issue, ParsedRow, validate_rows

OUTLIER_MIN_ROWS = 5
OUTLIER_Z = 3.5


class State(StrEnum):
    RECEIVED = "RECEIVED"
    VALIDATED = "VALIDATED"
    CLEANED = "CLEANED"
    NORMALIZED = "NORMALIZED"
    AGGREGATED = "AGGREGATED"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    PUBLISHED = "PUBLISHED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


TRANSITIONS: dict[State, frozenset[State]] = {
    State.RECEIVED: frozenset({State.VALIDATED, State.FAILED}),
    State.VALIDATED: frozenset({State.CLEANED, State.FAILED}),
    State.CLEANED: frozenset({State.NORMALIZED, State.FAILED}),
    State.NORMALIZED: frozenset({State.AGGREGATED, State.FAILED}),
    State.AGGREGATED: frozenset({State.PENDING_APPROVAL, State.FAILED}),
    State.PENDING_APPROVAL: frozenset({State.PUBLISHED, State.REJECTED, State.RECEIVED}),
    State.FAILED: frozenset({State.RECEIVED}),
    State.PUBLISHED: frozenset(),
    State.REJECTED: frozenset(),
}

PIPELINE_STATES = [State.RECEIVED, State.VALIDATED, State.CLEANED, State.NORMALIZED, State.AGGREGATED,
                   State.PENDING_APPROVAL]


class PipelineError(Exception):
    pass


class TransitionError(Exception):
    pass


@dataclass
class PipelineContext:
    tenant: Tenant
    dataset_id: str
    raw_rows: list[dict[str, Any]]
    rows: list[ParsedRow] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    frame: pd.DataFrame | None = None  # long format: one line per (territory, period, indicator)
    dimension_frame: pd.DataFrame | None = None


# --------------------------------------------------------------------------- #
# Steps (pure functions of the context)                                       #
# --------------------------------------------------------------------------- #
def step_validate(ctx: PipelineContext) -> str:
    report = validate_rows(ctx.raw_rows, ctx.tenant)
    ctx.issues = list(report.issues)
    if not report.is_valid:
        raise PipelineError(f"{report.error_count} erreur(s) de validation bloquante(s).")
    ctx.rows = report.rows
    return f"{len(ctx.rows)} ligne(s) valides, {report.warning_count} avertissement(s)."


def step_clean(ctx: PipelineContext) -> str:
    overrides = {int(r["_row"]): set(r.get("_overrides", [])) for r in ctx.raw_rows}
    records = []
    for r in ctx.rows:
        for code in INDICATORS:
            records.append({
                "tenant_id": ctx.tenant.id,
                "source_row": r.row,
                "territory_code": r.territory_code,
                "territory_name": r.territory_name,
                "period": r.period,
                "indicator_code": code,
                "raw_value": r.values.get(code),
                "overridden": code in overrides.get(r.row, set()),
            })
    df = pd.DataFrame.from_records(records)
    df = df.sort_values(["territory_code", "period", "indicator_code"], kind="mergesort").reset_index(drop=True)

    ref_min = df["indicator_code"].map(lambda c: INDICATORS[c].ref_min)
    ref_max = df["indicator_code"].map(lambda c: INDICATORS[c].ref_max)
    df["f_missing"] = df["raw_value"].isna()
    df["f_out_of_reference"] = ~df["f_missing"] & ((df["raw_value"] < ref_min) | (df["raw_value"] > ref_max))

    # Robust outlier detection (median / MAD), only when the batch is large enough to be meaningful.
    df["f_outlier"] = False
    for (code, _period), grp in df[~df["f_missing"]].groupby(["indicator_code", "period"]):
        if len(grp) < OUTLIER_MIN_ROWS:
            continue
        med = grp["raw_value"].median()
        mad = (grp["raw_value"] - med).abs().median()
        if mad == 0:
            continue
        z = 0.6745 * (grp["raw_value"] - med) / mad
        flagged = grp.index[z.abs() > OUTLIER_Z]
        df.loc[flagged, "f_outlier"] = True
        for i in flagged:
            row = df.loc[i]
            ctx.issues.append(Issue(row=int(row.source_row), column=code, severity="warning", code="outlier",
                                    message=f"Valeur atypique pour {row.territory_code} ({row.raw_value})."))

    def _flags(row: pd.Series) -> list[str]:
        out = []
        for name in ("missing", "out_of_reference", "outlier"):
            if row[f"f_{name}"]:
                out.append(name)
        if row["overridden"]:
            out.append("overridden")
        return out

    df["flags"] = df.apply(_flags, axis=1)
    ctx.frame = df.drop(columns=["f_missing", "f_out_of_reference", "f_outlier", "overridden"])
    n_missing = int(df["raw_value"].isna().sum())
    return f"{len(df)} valeurs, {n_missing} manquante(s), {int(df['flags'].map(lambda f: 'outlier' in f).sum())} atypique(s)."


def step_normalize(ctx: PipelineContext) -> str:
    df = ctx.frame
    assert df is not None
    df["score"] = [
        None if pd.isna(v) else normalize(float(v), INDICATORS[c]) for v, c in zip(df["raw_value"], df["indicator_code"])
    ]
    df["band"] = df["score"].map(band)
    return f"{int(df['score'].notna().sum())} score(s) calculés sur l'échelle 1–10."


def step_aggregate(ctx: PipelineContext) -> str:
    df = ctx.frame
    assert df is not None
    out = []
    for (code, name, period), grp in df.groupby(["territory_code", "territory_name", "period"], sort=True):
        scores = {r.indicator_code: (None if pd.isna(r.score) else float(r.score)) for r in grp.itertuples()}
        for dim in DIMENSIONS:
            res = aggregate_dimension(dim, scores)
            out.append({"tenant_id": ctx.tenant.id, "territory_code": code, "territory_name": name, "period": period,
                        "dimension": dim, "score": res.score, "band": res.band, "coverage": res.coverage})
    ctx.dimension_frame = pd.DataFrame.from_records(out)
    n_terr = df["territory_code"].nunique()
    return f"{len(out)} score(s) de dimension pour {n_terr} territoire(s)."


def _guard_segregation(ctx: PipelineContext, frame: pd.DataFrame) -> None:
    if frame.empty:
        return
    if set(frame["tenant_id"].unique()) != {ctx.tenant.id}:
        raise PipelineError("Violation d'isolation : enregistrement d'un autre tenant détecté.")
    allowed = ctx.tenant.allowed_territories
    if allowed is not None and not set(frame["territory_code"].unique()) <= allowed:
        raise PipelineError("Violation d'isolation : territoire hors périmètre du tenant.")


def _none(v: Any) -> Any:
    return None if v is None or (isinstance(v, float) and pd.isna(v)) else v


def make_persist_step(db: Session) -> Callable[[PipelineContext], str]:
    def step_persist(ctx: PipelineContext) -> str:
        assert ctx.frame is not None and ctx.dimension_frame is not None
        _guard_segregation(ctx, ctx.frame)
        _guard_segregation(ctx, ctx.dimension_frame)

        # Idempotent: a re-run (after override) replaces this dataset's previous outputs only.
        db.execute(delete(Observation).where(Observation.dataset_id == ctx.dataset_id,
                                             Observation.tenant_id == ctx.tenant.id))
        db.execute(delete(DimensionScore).where(DimensionScore.dataset_id == ctx.dataset_id,
                                                DimensionScore.tenant_id == ctx.tenant.id))
        db.add_all(
            Observation(dataset_id=ctx.dataset_id, tenant_id=r["tenant_id"], source_row=int(r["source_row"]),
                        territory_code=r["territory_code"], territory_name=r["territory_name"],
                        period=int(r["period"]), indicator_code=r["indicator_code"],
                        raw_value=_none(r["raw_value"]), score=_none(r["score"]), band=r["band"], flags=r["flags"])
            for r in ctx.frame.to_dict(orient="records")
        )
        db.add_all(
            DimensionScore(dataset_id=ctx.dataset_id, tenant_id=r["tenant_id"], territory_code=r["territory_code"],
                           territory_name=r["territory_name"], period=int(r["period"]), dimension=r["dimension"],
                           score=_none(r["score"]), band=r["band"], coverage=float(r["coverage"]))
            for r in ctx.dimension_frame.to_dict(orient="records")
        )
        return "Résultats enregistrés, en attente de validation par un administrateur."

    return step_persist


# --------------------------------------------------------------------------- #
# State machine driver                                                        #
# --------------------------------------------------------------------------- #
def transition(db: Session, ds: Dataset, to: State, actor: str, message: str | None = None,
               duration_ms: float | None = None) -> None:
    current = State(ds.status)
    if to not in TRANSITIONS[current]:
        raise TransitionError(f"Transition interdite : {current} → {to}")
    db.add(DatasetEvent(dataset_id=ds.id, tenant_id=ds.tenant_id, from_state=current, to_state=to, actor=actor,
                        message=message, duration_ms=duration_ms))
    ds.status = to
    if to is State.PUBLISHED:
        ds.published_at = datetime.now(UTC)
    db.commit()  # commit each step so the processing hub can follow progress


def run_pipeline(db: Session, ds: Dataset, actor: str = "pipeline") -> Dataset:
    if ds.status != State.RECEIVED:
        raise TransitionError(f"Le pipeline démarre depuis RECEIVED (état actuel : {ds.status}).")

    ctx = PipelineContext(tenant=tenant_by_id(ds.tenant_id), dataset_id=ds.id, raw_rows=list(ds.raw_rows))
    plan: list[tuple[State, Callable[[PipelineContext], str]]] = [
        (State.VALIDATED, step_validate),
        (State.CLEANED, step_clean),
        (State.NORMALIZED, step_normalize),
        (State.AGGREGATED, step_aggregate),
        (State.PENDING_APPROVAL, make_persist_step(db)),
    ]
    for target, step in plan:
        t0 = time.perf_counter()
        try:
            message = step(ctx)
        except PipelineError as exc:
            db.rollback()
            ds.issues = [i.model_dump() for i in ctx.issues]
            transition(db, ds, State.FAILED, actor, f"Échec à l'étape {target}: {exc}")
            return ds
        ds.issues = [i.model_dump() for i in ctx.issues]
        ds.row_count = len(ctx.rows)
        transition(db, ds, target, actor, message, round((time.perf_counter() - t0) * 1000, 2))
    return ds


def create_dataset(db: Session, principal: Principal, *, source_type: str, filename: str | None,
                   submitted_by: str, organization: str, description: str | None,
                   raw_rows: list[dict[str, Any]]) -> Dataset:
    ds = Dataset(
        tenant_id=principal.tenant.id,  # tenant ALWAYS comes from the authenticated principal, never the payload
        status=State.RECEIVED,
        source_type=source_type,
        filename=filename,
        stakeholder_type=principal.tenant.stakeholder_type,
        submitted_by=submitted_by,
        organization=organization,
        description=description,
        raw_rows=raw_rows,
        row_count=len(raw_rows),
        issues=[],
    )
    db.add(ds)
    db.flush()
    db.add(DatasetEvent(dataset_id=ds.id, tenant_id=ds.tenant_id, from_state=None, to_state=State.RECEIVED,
                        actor=principal.display_name, message=f"Jeu de données reçu ({source_type})."))
    db.commit()
    return run_pipeline(db, ds)


def review(db: Session, ds: Dataset, principal: Principal, approve: bool, comment: str | None) -> Dataset:
    ds.reviewed_by = principal.display_name
    ds.review_comment = comment
    transition(db, ds, State.PUBLISHED if approve else State.REJECTED, principal.display_name,
               comment or ("Publié" if approve else "Rejeté"))
    return ds


def override_value(db: Session, ds: Dataset, principal: Principal, *, row: int, column: str,
                   value: Any, reason: str) -> Dataset:
    """Admin correction of one raw cell, followed by a full deterministic re-run."""
    if State(ds.status) not in (State.PENDING_APPROVAL, State.FAILED):
        raise TransitionError("Correction possible uniquement en attente de validation ou après échec.")
    rows = [dict(r) for r in ds.raw_rows]  # new objects so the JSON column is marked dirty
    target = next((r for r in rows if int(r.get("_row", -1)) == row), None)
    if target is None:
        raise PipelineError(f"Ligne {row} introuvable.")
    old = target.get(column)
    target[column] = value
    target["_overrides"] = sorted(set(target.get("_overrides", [])) | {column})
    ds.raw_rows = rows
    transition(db, ds, State.RECEIVED, principal.display_name,
               f"Correction ligne {row}, {column} : {old!r} → {value!r}. Motif : {reason}")
    return run_pipeline(db, ds)

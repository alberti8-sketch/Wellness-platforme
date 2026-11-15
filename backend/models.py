"""Persistence model. Every table carries `tenant_id`; every query must filter on it."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _uuid() -> str:
    return uuid.uuid4().hex


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    source_type: Mapped[str] = mapped_column(String(16))  # excel | manual
    filename: Mapped[str | None] = mapped_column(String(255))
    stakeholder_type: Mapped[str] = mapped_column(String(8))
    submitted_by: Mapped[str] = mapped_column(String(255))
    organization: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    raw_rows: Mapped[list[dict[str, Any]]] = mapped_column(JSON)  # immutable input (+ admin overrides)
    issues: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    reviewed_by: Mapped[str | None] = mapped_column(String(255))
    review_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    events: Mapped[list[DatasetEvent]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan", order_by="DatasetEvent.id"
    )


class DatasetEvent(Base):
    """Append-only audit trail of state transitions and admin actions."""

    __tablename__ = "dataset_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    from_state: Mapped[str | None] = mapped_column(String(32))
    to_state: Mapped[str] = mapped_column(String(32))
    actor: Mapped[str] = mapped_column(String(255))
    message: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[float | None] = mapped_column(Float)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    dataset: Mapped[Dataset] = relationship(back_populates="events")


class Observation(Base):
    """One (territory, period, indicator) value with its normalised score."""

    __tablename__ = "observations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64))
    source_row: Mapped[int] = mapped_column(Integer)  # spreadsheet row, used for admin overrides
    territory_code: Mapped[str] = mapped_column(String(16))
    territory_name: Mapped[str] = mapped_column(String(255))
    period: Mapped[int] = mapped_column(Integer)
    indicator_code: Mapped[str] = mapped_column(String(64))
    raw_value: Mapped[float | None] = mapped_column(Float)
    score: Mapped[float | None] = mapped_column(Float)
    band: Mapped[str | None] = mapped_column(String(16))
    flags: Mapped[list[str]] = mapped_column(JSON, default=list)

    __table_args__ = (Index("ix_obs_tenant_territory", "tenant_id", "territory_code", "period"),)


class DimensionScore(Base):
    __tablename__ = "dimension_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64))
    territory_code: Mapped[str] = mapped_column(String(16))
    territory_name: Mapped[str] = mapped_column(String(255))
    period: Mapped[int] = mapped_column(Integer)
    dimension: Mapped[str] = mapped_column(String(8))
    score: Mapped[float | None] = mapped_column(Float)
    band: Mapped[str | None] = mapped_column(String(16))
    coverage: Mapped[float] = mapped_column(Float)

    __table_args__ = (Index("ix_dim_tenant_territory", "tenant_id", "territory_code", "period"),)


class TerritoryContext(Base):
    """Descriptive context of a territory in a dataset (typology, population…). Never scored."""

    __tablename__ = "territory_contexts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64))
    territory_code: Mapped[str] = mapped_column(String(16))
    period: Mapped[int] = mapped_column(Integer)
    level: Mapped[str] = mapped_column(String(16))  # departement | commune
    territory_type: Mapped[str | None] = mapped_column(String(16))
    population: Mapped[float | None] = mapped_column(Float)
    density_km2: Mapped[float | None] = mapped_column(Float)
    source_global_score: Mapped[float | None] = mapped_column(Float)


class DepartmentHealthDataset(Base):
    """A CNAM reference snapshot, kept separate from scored/published indicators."""
    __tablename__ = "department_health_datasets"

    dataset_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True)
    source_name: Mapped[str] = mapped_column(String(255))
    year: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class User(Base):
    """A registered person (simple e-mail / password account). Belongs to one tenant, viewer role."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    job: Mapped[str] = mapped_column(String(80))
    city_code: Mapped[str] = mapped_column(String(16))
    tenant_id: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class UserSession(Base):
    """Sign-in session. Only the SHA-256 of the bearer token is stored."""

    __tablename__ = "user_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ChatConversation(Base):
    """A conversation with the assistant, kept per user (owner = tenant + account or API-key name)."""

    __tablename__ = "chat_conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    owner: Mapped[str] = mapped_column(String(320), index=True)
    tenant_id: Mapped[str] = mapped_column(String(64))
    city_code: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(160))
    # [{"role": "user" | "assistant", "content": str, "structured": {...} | null, "at": iso}]
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

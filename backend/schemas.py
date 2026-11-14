"""API response/request contracts (Pydantic v2)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from pipeline.validation import Issue


class SubmissionMeta(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    submitted_by: str = Field(min_length=2, max_length=255)
    organization: str = Field(min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=2000)


class ManualSubmission(SubmissionMeta):
    rows: list[dict[str, Any]] = Field(min_length=1, max_length=500)


class ManualPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rows: list[dict[str, Any]] = Field(min_length=1, max_length=500)


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    from_state: str | None
    to_state: str
    actor: str
    message: str | None
    duration_ms: float | None
    at: datetime


class DatasetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    source_type: str
    filename: str | None
    stakeholder_type: str
    submitted_by: str
    organization: str
    description: str | None
    row_count: int
    reviewed_by: str | None
    review_comment: str | None
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    error_count: int = 0
    warning_count: int = 0


class CellOut(BaseModel):
    raw_value: float | None
    score: float | None
    band: str | None
    flags: list[str]


class DimensionOut(BaseModel):
    score: float | None
    band: str | None
    coverage: float


class TableRow(BaseModel):
    source_row: int
    territory_code: str
    territory_name: str
    period: int
    cells: dict[str, CellOut]
    dimensions: dict[str, DimensionOut]


class DatasetDetail(DatasetSummary):
    events: list[EventOut]
    issues: list[Issue]
    table: list[TableRow]
    pipeline_states: list[str]


class ReviewIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    comment: str | None = Field(default=None, max_length=2000)


class OverrideIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    row: int = Field(ge=1)
    column: str = Field(min_length=1, max_length=64)
    value: float | None
    reason: str = Field(min_length=3, max_length=500)

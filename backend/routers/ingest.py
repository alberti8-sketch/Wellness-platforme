"""Data collection: Excel template, validation preview, Excel and manual submissions."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from config import MAX_UPLOAD_BYTES, Principal, Role
from db import get_db
from pipeline.catalog import ID_COLUMNS, INDICATORS
from pipeline.orchestrator import create_dataset
from pipeline.template import build_workbook
from pipeline.validation import IngestError, ValidationReport, parse_excel, validate_rows
from routers.datasets import to_summary
from schemas import DatasetSummary, ManualPreview, ManualSubmission, SubmissionMeta
from security import get_principal, require

router = APIRouter(prefix="/api/ingest", tags=["ingest"])

XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/template")
def download_template(_: Principal = Depends(get_principal)) -> Response:
    return Response(build_workbook(), media_type=XLSX_MIME,
                    headers={"Content-Disposition": 'attachment; filename="wellness_template.xlsx"'})


async def _read_xlsx(file: UploadFile) -> list[dict[str, Any]]:
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Seuls les fichiers .xlsx sont acceptés.")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"Fichier trop volumineux (max {MAX_UPLOAD_BYTES // (1024 * 1024)} Mo).")
    try:
        return parse_excel(content)
    except IngestError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc


def _manual_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    allowed = set(ID_COLUMNS) | set(INDICATORS)
    out = []
    for i, r in enumerate(rows):
        clean = {str(k).strip().lower(): v for k, v in r.items() if str(k).strip().lower() in allowed}
        clean["_row"] = i + 2  # same numbering as a spreadsheet (header = 1)
        out.append(clean)
    return out


def _reject_if_invalid(report: ValidationReport) -> None:
    if not report.is_valid:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail={"message": "Le jeu de données contient des erreurs bloquantes.",
                                    "report": report.model_dump(mode="json")})


@router.post("/preview", response_model=ValidationReport)
async def preview_excel(file: UploadFile = File(...),
                        principal: Principal = Depends(require(Role.CONTRIBUTOR))) -> ValidationReport:
    return validate_rows(await _read_xlsx(file), principal.tenant)


@router.post("/preview-manual", response_model=ValidationReport)
def preview_manual(body: ManualPreview, principal: Principal = Depends(require(Role.CONTRIBUTOR))) -> ValidationReport:
    return validate_rows(_manual_rows(body.rows), principal.tenant)


@router.post("/upload", response_model=DatasetSummary, status_code=status.HTTP_201_CREATED)
async def upload_excel(
    file: UploadFile = File(...),
    submitted_by: str = Form(...),
    organization: str = Form(...),
    description: str | None = Form(None),
    principal: Principal = Depends(require(Role.CONTRIBUTOR)),
    db: Session = Depends(get_db),
) -> DatasetSummary:
    meta = SubmissionMeta(submitted_by=submitted_by, organization=organization, description=description or None)
    raw_rows = await _read_xlsx(file)
    _reject_if_invalid(validate_rows(raw_rows, principal.tenant))
    ds = create_dataset(db, principal, source_type="excel", filename=file.filename, raw_rows=raw_rows,
                        **meta.model_dump())
    return to_summary(ds)


@router.post("/manual", response_model=DatasetSummary, status_code=status.HTTP_201_CREATED)
def submit_manual(body: ManualSubmission, principal: Principal = Depends(require(Role.CONTRIBUTOR)),
                  db: Session = Depends(get_db)) -> DatasetSummary:
    raw_rows = _manual_rows(body.rows)
    _reject_if_invalid(validate_rows(raw_rows, principal.tenant))
    ds = create_dataset(db, principal, source_type="manual", filename=None, raw_rows=raw_rows,
                        **body.model_dump(exclude={"rows"}))
    return to_summary(ds)

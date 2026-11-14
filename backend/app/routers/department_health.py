"""Tenant-scoped storage and retrieval for uploaded CNAM reference snapshots."""
import logging
import uuid
from zipfile import BadZipFile
from xml.etree.ElementTree import ParseError

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from xlrd.biffh import XLRDError

from app.config import settings
from app.database import get_db
from app.department_health import parse_department_health
from app.models import DepartmentHealthDataset


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/department-health", tags=["department-health"])


@router.post("/upload", status_code=201)
async def upload_department_health(
    file: UploadFile = File(...),
    tenant_id: str = Form(..., min_length=1, max_length=128),
    db: Session = Depends(get_db),
):
    tenant_id = tenant_id.strip()
    if not tenant_id:
        raise HTTPException(422, "Tenant ID must not be blank")
    filename = file.filename or ""
    if not filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(400, "Only .xls and .xlsx CNAM workbooks are supported")
    contents = await file.read(settings.max_upload_size + 1)
    if len(contents) > settings.max_upload_size:
        raise HTTPException(413, "Workbook exceeds the 10 MB upload limit")
    try:
        payload = parse_department_health(contents, filename)
        if not payload["departments"]:
            raise ValueError("No department matches the eight WP25 cities")
    except (ValueError, XLRDError, BadZipFile, ParseError, EOFError) as exc:
        logger.warning("Invalid department workbook: %s", exc)
        raise HTTPException(422, str(exc)) from exc
    dataset = DepartmentHealthDataset(
        dataset_id=str(uuid.uuid4()), tenant_id=tenant_id,
        source_name=payload["source_name"], year=payload["year"], payload=payload,
    )
    try:
        db.add(dataset)
        db.commit()
        db.refresh(dataset)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Could not save department workbook")
        raise HTTPException(500, "Could not save workbook; please retry") from exc
    return _dataset_summary(dataset)


def _dataset_summary(dataset):
    return {
        "dataset_id": dataset.dataset_id, "source_name": dataset.source_name,
        "year": dataset.year, "created_at": dataset.created_at.isoformat(),
    }


@router.get("")
def list_department_datasets(
    tenant_id: str = Query(..., min_length=1, max_length=128),
    db: Session = Depends(get_db),
):
    datasets = db.query(DepartmentHealthDataset).filter(
        DepartmentHealthDataset.tenant_id == tenant_id.strip()
    ).order_by(DepartmentHealthDataset.created_at.desc()).all()
    return {"datasets": [_dataset_summary(dataset) for dataset in datasets]}


@router.get("/{dataset_id}")
def get_department_dataset(
    dataset_id: str,
    tenant_id: str = Query(..., min_length=1, max_length=128),
    db: Session = Depends(get_db),
):
    dataset = db.query(DepartmentHealthDataset).filter(
        DepartmentHealthDataset.dataset_id == dataset_id,
        DepartmentHealthDataset.tenant_id == tenant_id.strip(),
    ).first()
    if dataset is None:
        raise HTTPException(404, "Dataset not found for this tenant")
    return {"dataset_id": dataset.dataset_id, **dataset.payload}

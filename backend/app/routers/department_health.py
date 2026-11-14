"""Tenant-scoped storage and retrieval for uploaded CNAM reference snapshots."""
import logging
import uuid
from zipfile import BadZipFile
from xml.etree.ElementTree import ParseError

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from xlrd.biffh import XLRDError

from config import MAX_UPLOAD_BYTES, Principal, Role
from db import get_db
from app.department_health import parse_department_health
from models import DepartmentHealthDataset
from security import get_principal, require


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/department-health", tags=["department-health"])


@router.post("/upload", status_code=201)
async def upload_department_health(
    file: UploadFile = File(...),
    principal: Principal = Depends(require(Role.CONTRIBUTOR)),
    db: Session = Depends(get_db),
):
    filename = file.filename or ""
    if not filename.lower().endswith((".xls", ".xlsx")):
        raise HTTPException(400, "Only .xls and .xlsx CNAM workbooks are supported")
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Workbook exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit")
    try:
        payload = parse_department_health(contents, filename)
        if not payload["departments"]:
            raise ValueError("No department matches the eight WP25 cities")
    except (ValueError, XLRDError, BadZipFile, ParseError, EOFError) as exc:
        logger.warning("Invalid department workbook: %s", exc)
        raise HTTPException(422, str(exc)) from exc
    allowed = principal.tenant.allowed_territories
    if allowed is not None and set(payload["departments"]) - allowed:
        raise HTTPException(403, "Workbook includes departments outside this tenant's geographic scope")
    dataset = DepartmentHealthDataset(
        dataset_id=str(uuid.uuid4()), tenant_id=principal.tenant.id,
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
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
):
    datasets = db.query(DepartmentHealthDataset).filter(
        DepartmentHealthDataset.tenant_id == principal.tenant.id
    ).order_by(DepartmentHealthDataset.created_at.desc()).all()
    return {"datasets": [_dataset_summary(dataset) for dataset in datasets]}


@router.get("/{dataset_id}")
def get_department_dataset(
    dataset_id: str,
    principal: Principal = Depends(get_principal),
    db: Session = Depends(get_db),
):
    dataset = db.query(DepartmentHealthDataset).filter(
        DepartmentHealthDataset.dataset_id == dataset_id,
        DepartmentHealthDataset.tenant_id == principal.tenant.id,
    ).first()
    if dataset is None:
        raise HTTPException(404, "Dataset not found for this tenant")
    payload = dataset.payload
    if principal.tenant.allowed_territories is not None:
        payload = {
            **payload,
            "departments": {
                code: values for code, values in payload["departments"].items()
                if code in principal.tenant.allowed_territories
            },
        }
    return {"dataset_id": dataset.dataset_id, **payload}

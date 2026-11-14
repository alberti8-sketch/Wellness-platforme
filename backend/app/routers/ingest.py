"""
Excel parsing and validation router.
Handles file upload, schema validation, and triggers pipeline.
"""
import logging
import io
from typing import List
import pandas as pd
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from datetime import datetime
import uuid

from app.schemas import (
    RegionIndicatorData,
    ExcelUploadSchema,
    IndicatorType
)
from app.pipeline.orchestrator import DeterministicPipeline, PipelineContext, PipelineStep

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ingest", tags=["data-ingestion"])


def parse_excel_file(file_contents: bytes, tenant_id: str, region_code: str) -> List[RegionIndicatorData]:
    """
    Parse Excel file and extract indicator data.
    Expected columns: Pincode, City, PA (Physical Activity), NUT (Nutrition), 
                     ENV (Environment), Disease Name, Disease Prevalence (%)
    """
    try:
        # Read Excel file
        df = pd.read_excel(io.BytesIO(file_contents), sheet_name=0)
        
        # Validate required columns
        required_cols = {'Pincode', 'City', 'PA', 'NUT', 'ENV', 'Disease', 'Disease_Prevalence'}
        if not required_cols.issubset(set(df.columns)):
            missing = required_cols - set(df.columns)
            raise ValueError(f"Missing columns: {missing}")
        
        records = []
        
        for idx, row in df.iterrows():
            if pd.isna(row['Pincode']) or pd.isna(row['City']):
                logger.warning(f"Row {idx}: Skipping - missing pincode or city")
                continue
            
            pincode = str(row['Pincode']).strip()
            city = str(row['City']).strip()
            
            # Physical Activity
            if not pd.isna(row['PA']):
                records.append(RegionIndicatorData(
                    pincode=pincode,
                    city=city,
                    indicator_type=IndicatorType.PA,
                    indicator_name="Physical Activity Index",
                    raw_value=float(row['PA']),
                    unit="minutes/week",
                    data_date=datetime.utcnow()
                ))
            
            # Nutrition
            if not pd.isna(row['NUT']):
                records.append(RegionIndicatorData(
                    pincode=pincode,
                    city=city,
                    indicator_type=IndicatorType.NUT,
                    indicator_name="Nutrition Score",
                    raw_value=float(row['NUT']),
                    unit="score",
                    data_date=datetime.utcnow()
                ))
            
            # Environment
            if not pd.isna(row['ENV']):
                records.append(RegionIndicatorData(
                    pincode=pincode,
                    city=city,
                    indicator_type=IndicatorType.ENV,
                    indicator_name="Environmental Quality Index",
                    raw_value=float(row['ENV']),
                    unit="score",
                    data_date=datetime.utcnow()
                ))
            
            # Clinical Disease
            if not pd.isna(row['Disease']) and not pd.isna(row['Disease_Prevalence']):
                records.append(RegionIndicatorData(
                    pincode=pincode,
                    city=city,
                    indicator_type=IndicatorType.DISEASE,
                    indicator_name=str(row['Disease']),
                    raw_value=float(row['Disease_Prevalence']),
                    unit="% prevalence",
                    data_date=datetime.utcnow()
                ))
        
        if not records:
            raise ValueError("No valid data records extracted from Excel")
        
        logger.info(f"Parsed {len(records)} records from Excel file")
        return records
    
    except Exception as e:
        logger.error(f"Excel parsing error: {str(e)}")
        raise


@router.post("/upload")
async def upload_health_data(
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    tenant_name: str = Form(...),
    region_code: str = Form(...)
):
    """
    Upload and process Excel health data file.
    Triggers deterministic pipeline execution.
    """
    try:
        if not file.filename.endswith('.xlsx'):
            raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
        
        # Read file
        file_contents = await file.read()
        
        # Parse Excel
        data_records = parse_excel_file(file_contents, tenant_id, region_code)
        
        # Validate schema
        upload_schema = ExcelUploadSchema(
            tenant_id=tenant_id,
            tenant_name=tenant_name,
            region_code=region_code,
            data_rows=data_records
        )
        
        # Create pipeline context
        context = PipelineContext(
            tenant_id=tenant_id,
            region_code=region_code,
            raw_data=upload_schema.data_rows,
            current_step=PipelineStep.STEP_1_INGESTION
        )
        
        # Execute deterministic pipeline
        pipeline = DeterministicPipeline()
        result_context = pipeline.execute(context)
        
        # Check for errors
        if result_context.errors:
            logger.error(f"Pipeline errors: {result_context.errors}")
            raise HTTPException(status_code=400, detail=f"Pipeline failed: {result_context.errors}")
        
        # Prepare response
        job_id = str(uuid.uuid4())
        response = {
            "job_id": job_id,
            "tenant_id": tenant_id,
            "region_code": region_code,
            "status": "processing_complete",
            "raw_records_processed": len(result_context.raw_data),
            "normalized_records": len(result_context.normalized_data) if result_context.normalized_data else 0,
            "composite_scores": len(result_context.composite_scores) if result_context.composite_scores else 0,
            "composite_wellness_data": [
                {
                    "pincode": score.pincode,
                    "city": score.city,
                    "region": score.region,
                    "pa_score": score.pa_score,
                    "nut_score": score.nut_score,
                    "env_score": score.env_score,
                    "disease_burden_score": score.disease_burden_score,
                    "overall_wellness_score": score.overall_wellness_score,
                    "health_rank": score.health_rank.value
                }
                for score in result_context.composite_scores
            ]
        }
        
        logger.info(f"Pipeline execution complete for job {job_id}")
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/validation-preview/{job_id}")
async def get_validation_preview(job_id: str):
    """
    Get data validation preview before final submission.
    """
    # In a real implementation, this would query the database
    return {
        "job_id": job_id,
        "validation_status": "valid",
        "warnings": [],
        "ready_for_approval": True
    }

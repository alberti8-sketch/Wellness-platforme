"""
Pydantic v2 schemas for strict input validation and tenant isolation.
"""
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum


class HealthScaleEnum(str, Enum):
    """Standardized health score scale."""
    CRITICAL = "critical"  # Score 0
    MEDIUM = "medium"      # Score 5
    GOOD = "good"          # Score 10


class IndicatorType(str, Enum):
    """Health indicator types matching the matrix structure."""
    PA = "physical_activity"
    NUT = "nutrition"
    ENV = "environment"
    DISEASE = "clinical_disease"


class RegionIndicatorData(BaseModel):
    """Single data point for a region/pincode."""
    pincode: str = Field(..., description="Unique pincode identifier")
    city: str = Field(..., description="City name")
    region: Optional[str] = None
    department: Optional[str] = None
    indicator_type: IndicatorType
    indicator_name: str
    raw_value: float = Field(..., ge=0, description="Raw numeric value")
    unit: Optional[str] = None
    data_date: datetime
    
    @validator('pincode')
    def validate_pincode(cls, v):
        if not v or len(v) < 1:
            raise ValueError("Pincode cannot be empty")
        return str(v).strip()


class ExcelUploadSchema(BaseModel):
    """Validates Excel file structure before ingestion."""
    tenant_id: str = Field(..., description="Unique tenant identifier for isolation")
    tenant_name: str
    region_code: str = Field(..., description="Geographic region code")
    data_rows: List[RegionIndicatorData]
    
    @validator('tenant_id', 'region_code')
    def validate_identifiers(cls, v):
        if not v or not v.strip():
            raise ValueError("Identifier cannot be empty")
        return v.strip()


class ProcessingPipelineState(BaseModel):
    """Tracks pipeline execution state."""
    tenant_id: str
    region_code: str
    step: int  # 1=Ingestion, 2=Cleaning, 3=Aggregation, 4=Output
    status: str  # pending, processing, completed, failed
    error_message: Optional[str] = None
    processed_records: int = 0
    timestamp: datetime


class NormalizedIndicator(BaseModel):
    """Normalized indicator with score and classification."""
    pincode: str
    city: str
    indicator_type: IndicatorType
    indicator_name: str
    raw_value: float
    normalized_score: float = Field(..., ge=0, le=10)  # 0, 5, or 10
    health_classification: HealthScaleEnum
    data_date: datetime


class CompositeWellnessScore(BaseModel):
    """Aggregated wellness metrics for a region."""
    pincode: str
    city: str
    region: Optional[str]
    pa_score: float = Field(..., ge=0, le=10)
    nut_score: float = Field(..., ge=0, le=10)
    env_score: float = Field(..., ge=0, le=10)
    disease_burden_score: float = Field(..., ge=0, le=10)
    overall_wellness_score: float = Field(..., ge=0, le=10)
    health_rank: HealthScaleEnum
    last_updated: datetime


class DataApprovalRequest(BaseModel):
    """Admin approval for processed datasets."""
    processing_id: str
    approve: bool
    approval_notes: Optional[str] = None
    approver_id: str

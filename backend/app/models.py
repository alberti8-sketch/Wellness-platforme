"""
SQLAlchemy models for database persistence.
"""
from sqlalchemy import Column, String, Float, DateTime, Integer, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from app.schemas import HealthScaleEnum, IndicatorType

Base = declarative_base()


class Tenant(Base):
    """Tenant model for multi-tenancy isolation."""
    __tablename__ = "tenants"
    
    tenant_id = Column(String, primary_key=True)
    tenant_name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    regions = relationship("Region", back_populates="tenant")
    processing_jobs = relationship("ProcessingJob", back_populates="tenant")


class Region(Base):
    """Geographic region/territory model."""
    __tablename__ = "regions"
    
    region_id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey("tenants.tenant_id"), nullable=False)
    region_code = Column(String, nullable=False)
    region_name = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    tenant = relationship("Tenant", back_populates="regions")
    pincodes = relationship("Pincode", back_populates="region")
    
    __table_args__ = (UniqueConstraint('tenant_id', 'region_code', name='_tenant_region_uc'),)


class Pincode(Base):
    """Pincode/city level geographic data."""
    __tablename__ = "pincodes"
    
    pincode_id = Column(String, primary_key=True)
    region_id = Column(String, ForeignKey("regions.region_id"), nullable=False)
    pincode = Column(String, nullable=False)
    city = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    region = relationship("Region", back_populates="pincodes")
    raw_indicators = relationship("RawIndicator", back_populates="pincode")
    composite_scores = relationship("CompositeWellnessScoreDB", back_populates="pincode")


class RawIndicator(Base):
    """Raw indicator data before normalization."""
    __tablename__ = "raw_indicators"
    
    raw_id = Column(String, primary_key=True)
    pincode_id = Column(String, ForeignKey("pincodes.pincode_id"), nullable=False)
    processing_job_id = Column(String, ForeignKey("processing_jobs.job_id"), nullable=False)
    indicator_type = Column(Enum(IndicatorType), nullable=False)
    indicator_name = Column(String, nullable=False)
    raw_value = Column(Float, nullable=False)
    unit = Column(String, nullable=True)
    data_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    pincode = relationship("Pincode", back_populates="raw_indicators")
    job = relationship("ProcessingJob", back_populates="raw_indicators")


class CompositeWellnessScoreDB(Base):
    """Computed composite wellness scores."""
    __tablename__ = "composite_wellness_scores"
    
    score_id = Column(String, primary_key=True)
    pincode_id = Column(String, ForeignKey("pincodes.pincode_id"), nullable=False)
    processing_job_id = Column(String, ForeignKey("processing_jobs.job_id"), nullable=False)
    
    pa_score = Column(Float, nullable=False)
    nut_score = Column(Float, nullable=False)
    env_score = Column(Float, nullable=False)
    disease_burden_score = Column(Float, nullable=False)
    overall_wellness_score = Column(Float, nullable=False)
    health_rank = Column(Enum(HealthScaleEnum), nullable=False)
    
    approved = Column(Integer, default=0)  # 0=pending, 1=approved, -1=rejected
    approval_notes = Column(String, nullable=True)
    approver_id = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    pincode = relationship("Pincode", back_populates="composite_scores")
    job = relationship("ProcessingJob", back_populates="composite_scores")


class ProcessingJob(Base):
    """Track pipeline execution per tenant/region."""
    __tablename__ = "processing_jobs"
    
    job_id = Column(String, primary_key=True)
    tenant_id = Column(String, ForeignKey("tenants.tenant_id"), nullable=False)
    region_code = Column(String, nullable=False)
    
    step = Column(Integer, default=1)  # 1, 2, 3, 4
    status = Column(String, default="pending")  # pending, processing, completed, failed
    error_message = Column(String, nullable=True)
    processed_records = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    tenant = relationship("Tenant", back_populates="processing_jobs")
    raw_indicators = relationship("RawIndicator", back_populates="job")
    composite_scores = relationship("CompositeWellnessScoreDB", back_populates="job")

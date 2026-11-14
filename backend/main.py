"""Wellness & Population Health Analytics Platform — FastAPI entry point.

Run:  uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import CORS_ORIGIN_REGEX, CORS_ORIGINS, Principal
from db import init_db
from routers import analytics, context_data, datasets, geo, ingest, prediction
from security import get_principal
from app.routers import department_health


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Wellness Platform API",
    version="0.1.0",
    description="Ingestion, scoring déterministe et restitution d'indicateurs de santé populationnelle.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
    expose_headers=["Content-Disposition"],
)

app.include_router(ingest.router)
app.include_router(datasets.router)
app.include_router(analytics.router)
app.include_router(geo.router)
app.include_router(prediction.router)
app.include_router(context_data.router)
app.include_router(department_health.router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/me", tags=["system"])
def me(principal: Principal = Depends(get_principal)) -> dict:
    t = principal.tenant
    return {
        "name": principal.display_name,
        "role": principal.role.value,
        "tenant": {
            "id": t.id,
            "name": t.name,
            "stakeholder_type": t.stakeholder_type.value,
            "allowed_territories": sorted(t.allowed_territories) if t.allowed_territories else None,
        },
    }

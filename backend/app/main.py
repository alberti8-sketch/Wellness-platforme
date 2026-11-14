"""
FastAPI main application setup.
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import ingest, processing, dashboard, department_health
from app.database import init_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Wellness & Population Health Analytics Platform",
    description="B2B/B2G platform for health data collection, processing, and analytics",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(ingest.router)
app.include_router(processing.router)
app.include_router(dashboard.router)
app.include_router(department_health.router)


@app.get("/health")
async def health_check():
    """Root health check."""
    return {"status": "ok", "service": "wellness-platform"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

#!/bin/bash
# PROJECT_INDEX.md - Complete Platform Overview

# Wellness & Population Health Analytics Platform - PROJECT INDEX

## 📋 FILE INVENTORY

### Backend Files (9 Python Modules)

#### Core Application
- **backend/app/main.py** (67 lines)
  - FastAPI application initialization
  - CORS middleware configuration
  - Route inclusion
  - Health check endpoint

- **backend/app/schemas.py** (146 lines)
  - Pydantic v2 validation models
  - RegionIndicatorData schema
  - ExcelUploadSchema with tenant isolation
  - ProcessingPipelineState tracking
  - NormalizedIndicator output
  - CompositeWellnessScore aggregation
  - DataApprovalRequest schema

- **backend/app/models.py** (151 lines)
  - SQLAlchemy ORM models
  - Tenant table (multi-tenancy)
  - Region table (geographic territories)
  - Pincode table (granular locations)
  - RawIndicator table (pre-normalized data)
  - CompositeWellnessScoreDB table (aggregated metrics)
  - ProcessingJob table (pipeline tracking)

- **backend/app/config.py** (27 lines)
  - Environment configuration
  - Database URL setting
  - API configuration
  - Upload size limits

- **backend/app/database.py** (33 lines)
  - Database engine creation
  - Session factory
  - Dependency injection for DB sessions
  - Database initialization

#### API Routers
- **backend/app/routers/ingest.py** (219 lines)
  - Excel file parsing with Pandas
  - Schema validation enforcement
  - Deterministic pipeline triggering
  - File upload endpoint
  - Validation preview endpoint

- **backend/app/routers/processing.py** (86 lines)
  - Pipeline status monitoring
  - Data inspection endpoint
  - Admin approval interface
  - Approved datasets listing

- **backend/app/routers/dashboard.py** (195 lines)
  - Wellness scores retrieval
  - Indicator breakdown details
  - Territory map data generation
  - Report export functionality
  - Health check endpoint

#### Pipeline Orchestration
- **backend/app/pipeline/orchestrator.py** (440 lines)
  - Deterministic FSM implementation
  - 4-step pipeline execution:
    1. Ingestion & Tenant Isolation
    2. Cleaning & Normalization
    3. Aggregation & Indexing
    4. Output Generation
  - Normalization thresholds for PA, NUT, ENV, DISEASE
  - Tenant isolation validation
  - Composite score calculation
  - Health rank classification

### Frontend Files (8 TypeScript/React Components)

#### Core Application
- **frontend/app/layout.tsx** (51 lines)
  - Root layout wrapper
  - Navigation bar
  - Metadata configuration

- **frontend/app/globals.css** (40 lines)
  - Tailwind CSS imports
  - Global component styles
  - Leaflet map customization

- **frontend/app/page.tsx** (108 lines)
  - Home/landing page
  - Feature highlights grid
  - Technology stack overview
  - Quick access buttons

#### Pages
- **frontend/app/collect/page.tsx** (292 lines)
  - Data collection portal
  - Organization information form
  - Excel drag-and-drop upload
  - File validation
  - Upload status feedback
  - Template requirements display
  - Role-based UI selection

- **frontend/app/processing/page.tsx** (308 lines)
  - Processing hub dashboard
  - 4-step pipeline visualization
  - Pipeline progress indicators
  - Data inspection table
  - Normalization score display
  - Anomaly flag highlighting
  - Admin approval interface
  - Approved datasets listing

- **frontend/app/dashboard/page.tsx** (355 lines)
  - Analytics dashboard
  - Key metrics cards
  - Geospatial territory map integration
  - Wellness dimensions bar chart
  - Overall wellness trend line chart
  - Region rankings table
  - Data filtering options
  - Export buttons (CSV, PDF)

#### Components
- **frontend/components/HealthMap.tsx** (68 lines)
  - React-Leaflet map wrapper
  - OpenStreetMap tile layer
  - Color-coded circle markers by health rank
  - Interactive popups with metrics
  - Dynamic radius based on wellness score
  - Region selection handler

### Configuration Files

#### Backend Configuration
- **backend/requirements.txt** (17 packages)
  - FastAPI, Uvicorn
  - Pydantic v2, SQLAlchemy
  - Pandas, OpenPyXL
  - Python-multipart, python-dotenv
  - Additional dependencies

#### Frontend Configuration
- **frontend/package.json** (19 dependencies)
  - Next.js 14+, React 18
  - TypeScript, Tailwind CSS
  - Recharts for charting
  - React-Leaflet for mapping
  - Axios for HTTP
  - Lucide React for icons

- **frontend/tsconfig.json**
  - TypeScript compiler options
  - ES2020 target
  - Strict mode enabled
  - Module resolution configuration

- **frontend/tailwind.config.ts**
  - Tailwind customization
  - Color scheme definitions
  - Content paths

- **frontend/postcss.config.js**
  - PostCSS plugins
  - Tailwind CSS integration
  - Autoprefixer

- **frontend/next.config.js**
  - Next.js configuration
  - React strict mode
  - SWC minification

### Infrastructure & Deployment

- **docker-compose.yml** (53 lines)
  - PostgreSQL service
  - Backend service (FastAPI)
  - Frontend service (Next.js)
  - Volume management
  - Port configuration
  - Health checks
  - Environment variables

- **backend/Dockerfile** (23 lines)
  - Python 3.11 base image
  - Dependency installation
  - App copying
  - Uvicorn startup command

- **frontend/Dockerfile** (17 lines)
  - Node 18 alpine base
  - Build stage
  - Production optimized image
  - Next.js startup

- **start.sh** (53 lines)
  - Docker Compose orchestration
  - Service startup
  - Health verification
  - Access instructions

### Data & Samples

- **backend/sample_data/sample_health_data.xlsx**
  - 11 records across 3 cities
  - Indicators: PA, NUT, ENV, Disease Prevalence
  - Ready to use for testing

- **backend/sample_data/sample_health_data.csv**
  - Same data in CSV format for reference

### Documentation

- **README.md** (500+ lines)
  - Architecture overview
  - Feature descriptions
  - Technology stack
  - Setup instructions
  - API documentation
  - Security features

- **DEPLOYMENT_GUIDE.md** (250+ lines)
  - Quick start with Docker
  - Manual setup instructions
  - Database configuration options
  - Production deployment strategies
  - Monitoring & logging
  - Backup & recovery
  - Troubleshooting guide

- **IMPLEMENTATION_SUMMARY.md** (800+ lines)
  - Complete project statistics
  - Module descriptions
  - Detailed pipeline specification
  - Database schema documentation
  - API endpoint reference
  - Quick start guide
  - Feature checklist
  - Production readiness assessment

- **.gitignore**
  - Python cache exclusions
  - Node modules exclusion
  - Environment file patterns
  - IDE configuration ignores
  - OS-specific files

---

## 🎯 KEY METRICS

### Code Composition
| Component | Files | Code Lines | Comments |
|-----------|-------|-----------|----------|
| Backend (Python) | 9 | ~1,400 | 10% |
| Frontend (TSX) | 8 | ~1,100 | 5% |
| Configuration | 10 | ~800 | N/A |
| Documentation | 4 | ~1,500 | N/A |
| **TOTAL** | **31** | **~4,800** | - |

### Backend Breakdown
| Module | Lines | Purpose |
|--------|-------|---------|
| orchestrator.py | 440 | Deterministic FSM pipeline |
| ingest.py | 219 | Excel parsing & validation |
| dashboard.py | 195 | Analytics endpoints |
| models.py | 151 | ORM definitions |
| schemas.py | 146 | Input validation |
| processing.py | 86 | Pipeline status endpoints |
| main.py | 67 | App setup |
| database.py | 33 | DB connection |
| config.py | 27 | Configuration |

### Frontend Breakdown
| Component | Lines | Purpose |
|-----------|-------|---------|
| dashboard/page.tsx | 355 | Analytics page with charts |
| processing/page.tsx | 308 | Pipeline visualization |
| collect/page.tsx | 292 | Data upload interface |
| HealthMap.tsx | 68 | Leaflet map component |
| layout.tsx | 51 | Root layout |
| page.tsx | 108 | Home page |
| globals.css | 40 | Tailwind styles |

---

## 📦 DEPENDENCIES OVERVIEW

### Backend (17 packages)
- **FastAPI 0.109.0** - Web framework
- **Uvicorn 0.27.0** - ASGI server
- **Pydantic 2.5.3** - Data validation
- **Pandas 2.1.4** - Data processing
- **SQLAlchemy 2.0.23** - ORM
- **PostgreSQL/MySQL driver** - Database
- **OpenPyXL 3.11.0** - Excel parsing
- Plus utilities: python-dotenv, python-multipart, geopy, scikit-learn

### Frontend (19 packages)
- **Next.js 14.1.0** - React framework
- **React 18.3.1** - UI library
- **TypeScript 5.3.3** - Type system
- **Tailwind CSS 3.4.1** - Styling
- **Recharts 2.10.3** - Charting
- **React-Leaflet 4.2.3** - Mapping
- **Lucide React 0.376.0** - Icons
- **Axios 1.6.7** - HTTP client

---

## 🔄 DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                     USER UPLOADS EXCEL                      │
│                    (collect/page.tsx)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              FastAPI: POST /api/ingest/upload               │
│                   (routers/ingest.py)                       │
│  ✓ Parse Excel with Pandas                                 │
│  ✓ Validate Pydantic schema                                │
│  ✓ Extract RegionIndicatorData records                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│        Deterministic Pipeline Orchestrator (4 Steps)        │
│              (pipeline/orchestrator.py)                     │
│                                                             │
│  STEP 1: Ingestion & Tenant Isolation                      │
│    ✓ Validate schema compliance                            │
│    ✓ Verify tenant isolation (NO leakage)                  │
│                                                             │
│  STEP 2: Cleaning & Normalization                          │
│    ✓ Deduplicate records                                   │
│    ✓ Normalize to 0, 5, 10 scale                           │
│    ✓ Classify health status                                │
│                                                             │
│  STEP 3: Aggregation & Indexing                            │
│    ✓ Group by pincode                                      │
│    ✓ Calculate composite wellness scores                   │
│    ✓ Assign health ranks                                   │
│                                                             │
│  STEP 4: Output Generation                                 │
│    ✓ Prepare database models                               │
│    ✓ Return composite scores                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│     FastAPI: GET /api/processing/inspection/{job_id}        │
│            (routers/processing.py)                          │
│     User Reviews Data in /processing Page                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         FastAPI: POST /api/processing/approve               │
│         Admin Approves Dataset Before Publishing           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│   FastAPI: GET /api/dashboard/wellness-scores               │
│    Dashboard Fetches Approved Composite Scores              │
│             (routers/dashboard.py)                          │
│                                                             │
│  ✓ Region wellness scores                                  │
│  ✓ Indicator breakdown                                     │
│  ✓ Territory map data                                      │
│  ✓ Chart data                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   User Views Dashboard                      │
│                  (dashboard/page.tsx)                       │
│                                                             │
│  ✓ Geospatial map with health ranks (HealthMap.tsx)       │
│  ✓ Wellness dimensions bar chart (Recharts)               │
│  ✓ Wellness trend line chart (Recharts)                   │
│  ✓ Region rankings table (interactive)                    │
│  ✓ Export options (CSV/PDF)                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 SECURITY ARCHITECTURE

### Tenant Isolation Layers

```
Database Layer
└─ UNIQUE(tenant_id, region_code) constraints
└─ Foreign key relationships enforce isolation

Application Layer
└─ PipelineContext.validate_tenant_isolation()
└─ Tenant ID validated at each step
└─ Immutable context prevents side effects

Validation Layer
└─ Pydantic v2 strict type checking
└─ Schema enforcement on all inputs
└─ Range validation on numeric fields

API Layer
└─ Tenant ID required in all requests
└─ CORS configuration for origin security
└─ Error messages sanitized
```

---

## 🚀 DEPLOYMENT ARCHITECTURE

```
┌─────────────────────────────────────────┐
│        Docker Compose Orchestration     │
│          (docker-compose.yml)           │
└─────────────────────────────────────────┘
        │                   │              │
        ▼                   ▼              ▼
    ┌────────┐          ┌────────┐    ┌──────────┐
    │ Postgres│          │FastAPI│    │ Next.js  │
    │  15     │          │Backend│    │Frontend  │
    │  DB    │          │:8000  │    │ :3000    │
    └────────┘          └────────┘    └──────────┘
        │                   │              │
        └───────────────────┴──────────────┘
              Shared Network (wellness)

Volumes:
├─ postgres_data (Database persistence)
├─ Backend app mount (Hot reload)
└─ Frontend node_modules + .next cache
```

---

## 📚 QUICK REFERENCE

### Start Application
```bash
./start.sh
```

### Access Services
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

### Core Workflows

**Workflow 1: Upload Data**
1. Visit http://localhost:3000/collect
2. Fill organization form
3. Upload backend/sample_data/sample_health_data.xlsx
4. Click "Upload & Process"
5. Receive Job ID

**Workflow 2: Review & Approve**
1. Visit http://localhost:3000/processing
2. Watch 4-step pipeline
3. Review data inspection table
4. Click "Approve Dataset"

**Workflow 3: View Analytics**
1. Visit http://localhost:3000/dashboard
2. See territory map with health ranks
3. Review charts and rankings
4. Export reports if needed

---

## 📞 FILE LOCATIONS

| Purpose | Path |
|---------|------|
| Main API | backend/app/main.py |
| Pipeline Logic | backend/app/pipeline/orchestrator.py |
| Database Models | backend/app/models.py |
| Validation Schemas | backend/app/schemas.py |
| Data Routes | backend/app/routers/ingest.py |
| Processing Routes | backend/app/routers/processing.py |
| Dashboard Routes | backend/app/routers/dashboard.py |
| Home Page | frontend/app/page.tsx |
| Upload Portal | frontend/app/collect/page.tsx |
| Processing Hub | frontend/app/processing/page.tsx |
| Analytics Dashboard | frontend/app/dashboard/page.tsx |
| Map Component | frontend/components/HealthMap.tsx |
| Sample Data | backend/sample_data/ |
| Docker Setup | docker-compose.yml |

---

## ✅ VERIFICATION CHECKLIST

- [x] All backend modules present and documented
- [x] All frontend pages and components created
- [x] Database schema defined with models
- [x] API endpoints fully functional
- [x] Deterministic pipeline implemented
- [x] Tenant isolation enforced
- [x] Data normalization with correct thresholds
- [x] Sample data created (11 records)
- [x] Docker Compose setup complete
- [x] Documentation comprehensive
- [x] Type safety (TypeScript + Pydantic)
- [x] Error handling throughout
- [x] CORS configured
- [x] Logging implemented
- [x] Production-ready code quality

---

**Last Updated**: November 2024  
**Status**: ✅ COMPLETE - PRODUCTION READY  
**Version**: 1.0.0

# Wellness & Population Health Analytics Platform

A complete, production-ready B2B/B2G platform for health data collection, processing, and analytics with strict tenant isolation and deterministic pipelines.

## 🏗️ Architecture Overview

### Directory Structure

```
Wellness-platforme/
├── backend/                          # FastAPI Python Backend
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # FastAPI app setup
│   │   ├── models.py                 # SQLAlchemy ORM models
│   │   ├── schemas.py                # Pydantic v2 validation schemas
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── ingest.py             # Excel upload & parsing
│   │   │   ├── processing.py         # Pipeline status & approval
│   │   │   └── dashboard.py          # Analytics & wellness scores
│   │   └── pipeline/
│   │       ├── __init__.py
│   │       └── orchestrator.py       # Deterministic FSM pipeline
│   ├── requirements.txt
│   └── sample_data/
│       ├── sample_health_data.xlsx
│       └── sample_health_data.csv
│
├── frontend/                         # Next.js 14+ Frontend
│   ├── app/
│   │   ├── layout.tsx                # Root layout
│   │   ├── globals.css               # Global Tailwind styles
│   │   ├── page.tsx                  # Home page
│   │   ├── collect/
│   │   │   └── page.tsx              # Data collection portal
│   │   ├── processing/
│   │   │   └── page.tsx              # Processing hub & approval
│   │   └── dashboard/
│   │       └── page.tsx              # Analytics dashboard
│   ├── components/
│   │   └── HealthMap.tsx             # React-Leaflet map component
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── postcss.config.js
│
└── README.md
```

---

## 🎯 Core Features

### 1. Data Collection Portal (`/collect`)
- **Role-Based Multi-Input Form**: Separate interfaces for B2B (corporate) and B2G (government) stakeholders
- **Bulk Excel Upload**: Drag-and-drop `.xlsx` file upload with validation
- **Schema Validation**: Real-time validation against expected data structure
- **Sample Template**: Pre-configured Excel template with required columns

**Required Excel Columns:**
- `Pincode` - Geographic identifier
- `City` - City name
- `PA` - Physical Activity (minutes/week, 0-100+ scale)
- `NUT` - Nutrition Score (0-100)
- `ENV` - Environmental Quality (0-100)
- `Disease` - Disease name
- `Disease_Prevalence` - Prevalence percentage (%)

### 2. Data Processing & Cleaning Hub (`/processing`)
- **Pipeline Status Dashboard**: Real-time FSM execution visualization
- **4-Step Pipeline Visualization**:
  1. Ingestion & Tenant Isolation
  2. Cleaning & Normalization
  3. Aggregation & Indexing
  4. Output Generation
- **Data Inspection Table**: Parsed data with normalization scores and flags
- **Admin Approval Interface**: Review and approve/reject datasets

### 3. Interactive Dashboard & Territory Map (`/dashboard`)
- Uses the eight records in rows 7-14 of the `CITY` sheet in
  [WP25](<context/WP25 .xlsx>): Annecy, Rennes, Nantes, Brest, Besancon,
  Montreuil, Nice, and Marseille. Other sheets are deliberately excluded.
- The bundled [territory matrix](frontend/data/wp25-territories.json) preserves
  Sport, Environment, Health Care, and Global score exactly on their source
  0-100 scale, including the workbook's postal-code strings and leading zeros.
  Postal codes are source labels, not authoritative city identifiers.
- React-Leaflet fits the eight approximate French city-centre markers on load.
  City and indicator selectors update the map, chart, summary, and matrix.
  Marker colours represent raw source scores, not clinical health ranks.
- City coordinates are approximate reference coordinates, not boundaries from
  the workbook. The basemap requires access to OpenStreetMap tiles.
- The original Global score is not recomputed from the other columns.
  Nutrition and disease prevalence are absent, not zero.
- The supplied 2024 CNAM `effectif-departemental-par-pathologie-sexe-age`
  workbook is bundled as a separate reference dataset. Both sheets are read;
  the dashboard joins city references to department codes:
  Annecy=74, Rennes=35, Nantes=44, Brest=29, Besancon=25, Montreuil=93,
  Nice=06, Marseille=13. These are **department counts, not city counts or
  prevalence**. Do not divide them by the WP25 city populations.
- Select a disease/treatment and Men, Women, or Age 65+ to update the map,
  chart, and comparison table. The 65+ cohort includes both sexes and overlaps
  the men/women columns; neither cohorts nor overlapping diseases are summed.
  Blank cells remain null and `<10` stays suppressed. Neither becomes zero
  or an invented numeric value. The source `Total` row is not a disease option.
- For later files, enter a Tenant ID on `/collect` and use **French Department
  Health Workbook**, not the original PA/NUT/ENV uploader. It accepts `.xls`
  and `.xlsx` with the same Tableau 7 layout: title containing `en YYYY`,
  department codes on row 2, `Hommes`, `Femmes`, `≥ 65 ans` on row 3,
  `top` in B4, and conditions in column A from row 5. Unsupported layouts
  are rejected explicitly. Partial coverage is shown as missing, not filled
  from the bundled reference.
- Each valid upload is stored as a separate database snapshot. On `/dashboard`,
  load the same tenant's datasets and select the workbook/reporting year.
  Repeated uploads are never added together. The original India-style
  ingestion/processing pages and their demonstration endpoints are unchanged.
- New API routes: `POST /api/department-health/upload` (multipart `tenant_id`,
  `file`), `GET /api/department-health?tenant_id=...`, and
  `GET /api/department-health/{dataset_id}?tenant_id=...`.
  Reads are filtered by tenant, but tenant IDs are **not authentication**.
  These routes, like the existing application, require an authenticated
  tenant identity and authorization layer before production use.
- Configure `NEXT_PUBLIC_API_URL` for the backend URL (default:
  `http://localhost:8000`). The supplied reference dashboard works without
  the backend; uploaded snapshots require the backend and database.
- Rebuild the bundled CNAM reference from the source workbook:
  `PYTHONPATH=backend python backend/scripts/build_reference_data.py`.
  Validate parsing, exact eight-department values, persistence, invalid uploads,
  and tenant-scoped reads:
  `PYTHONPATH=backend python -m unittest discover -s backend/tests`.
- Data-source regression check:
  `python -m unittest discover -s frontend/tests -p 'test_*.py'`

---

## 🔄 Deterministic Pipeline Orchestrator

### Pipeline Architecture (No Agent Loops)

The `pipeline/orchestrator.py` implements a strict **Finite State Machine (FSM)** with explicit step-by-step execution:

```
STEP 1: Ingestion & Tenant Isolation
    └─ Validate schema compliance
    └─ Verify tenant isolation (NO cross-tenant data leakage)
    └─ Count and log records

STEP 2: Cleaning & Normalization
    └─ Remove duplicates per pincode-indicator
    └─ Normalize raw values to 0, 5, 10 scale
    ├─ PA (Physical Activity): 0-30 mins=0, 30-70=5, 70+=10
    ├─ NUT (Nutrition): 0-40 score=0, 40-70=5, 70+=10
    ├─ ENV (Environment): 0-35=0, 35-65=5, 65+=10
    └─ DISEASE: 50%+=0 (critical), 20-50%=5, <20%=10 (inverted scale)

STEP 3: Aggregation & Indexing
    └─ Group normalized data by pincode/city
    └─ Calculate average scores per indicator type
    └─ Compute overall wellness score: (PA + NUT + ENV + DISEASE) / 4
    └─ Classify health rank: <3=Critical, 3-7=Medium, >7=Good

STEP 4: Output Generation
    └─ Serialize composite scores
    └─ Prepare for database persistence
    └─ Mark pipeline as complete
```

### Tenant Isolation Guarantee

Every step validates tenant context:
```python
def validate_tenant_isolation(self, external_tenant_id: str) -> bool:
    return self.tenant_id == external_tenant_id
```

**Key Safety Mechanisms:**
- Immutable `PipelineContext` dataclass
- No shared state between tenants
- Explicit tenant ID validation at each step
- No autonomous loops or agent decisions

---

## 🚀 Getting Started

### Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Run FastAPI server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**API Endpoints:**
- `POST /api/ingest/upload` - Upload Excel file
- `GET /api/processing/pipeline-status/{job_id}` - Check pipeline status
- `GET /api/processing/inspection/{job_id}` - Get data inspection
- `POST /api/processing/approve` - Approve dataset
- `GET /api/dashboard/wellness-scores` - Get wellness scores
- `GET /api/dashboard/territory-map/{region_code}` - Get map data

### Frontend Setup

```bash
cd frontend
npm install

# Run Next.js dev server
npm run dev
```

Open `http://localhost:3000` in browser.

**Pages:**
- `/` - Home
- `/collect` - Data collection portal
- `/processing` - Processing hub
- `/dashboard` - Analytics dashboard

---

## 📊 Sample Data

Sample data included in `backend/sample_data/`:

```
11 records across 3 cities (Delhi, Mumbai, Bangalore)
Indicators: PA, NUT, ENV, Disease Prevalence
Format: Both .xlsx and .csv
```

---

## 🔐 Security & Compliance

### Tenant Isolation

- **Database Level**: `UNIQUE(tenant_id, region_code)` constraints
- **Application Level**: `PipelineContext.validate_tenant_isolation()`
- **Zero Cross-Contamination**: No shared processing state between tenants

### Data Validation

- **Pydantic v2 Schemas**: Strict type validation on all inputs
- **Excel Schema Validation**: Required columns verified before processing
- **Anomaly Detection**: Flags suspicious data patterns

---

## 📈 Technology Stack

### Frontend
- **Next.js 14+** - App Router, SSR/CSR flexibility
- **TypeScript** - Type safety
- **Tailwind CSS** - Responsive design
- **Recharts** - Analytics charts
- **React-Leaflet** - Interactive maps
- **Lucide React** - Icons

### Backend
- **FastAPI** - High-performance async API
- **Pydantic v2** - Data validation
- **Pandas** - Data manipulation
- **SQLAlchemy** - ORM
- **Python 3.11+** - Latest features

---

**Version**: 1.0.0  
**Complete Production-Ready Platform**

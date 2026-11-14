"""Load and publish the WP25 demo dataset so the dashboard is populated right after a clone.

Usage (from backend/):  python -m scripts.seed_demo [--force]

Runs the regular deterministic pipeline (no shortcut) for the demo B2G tenant, then
approves the dataset. Skips if that tenant already has published data, unless --force.
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from config import principals
from db import SessionLocal, init_db
from models import Dataset
from pipeline.orchestrator import State, create_dataset, review
from pipeline.validation import validate_rows
from scripts.import_wp25 import load_converted

DEMO_KEY = "demo-b2g-admin"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    init_db()
    principal = principals()[DEMO_KEY]
    with SessionLocal() as db:
        already = db.scalar(select(Dataset).where(Dataset.tenant_id == principal.tenant.id,
                                                  Dataset.status == State.PUBLISHED))
        if already and "--force" not in sys.argv:
            print("Des données publiées existent déjà pour le tenant de démo (utiliser --force pour recharger).")
            return
        rows = load_converted()
        raw = [{**r, "_row": i + 2} for i, r in enumerate(rows)]
        report = validate_rows(raw, principal.tenant)
        if not report.is_valid:
            raise SystemExit(f"Données invalides : {[i.message for i in report.issues if i.severity == 'error']}")
        ds = create_dataset(db, principal, source_type="excel", filename="WP25.xlsx (démo)",
                            submitted_by=principal.display_name, organization=principal.tenant.name,
                            description="Import automatique WP25 — Drive HACKATHON 13/11/26", raw_rows=raw)
        if ds.status != State.PENDING_APPROVAL:
            raise SystemExit(f"Pipeline en échec : {ds.status}")
        review(db, ds, principal, True, "Publication automatique des données de démo")
        print(f"Jeu de démo publié : {len(rows)} communes (dataset {ds.id}).")


if __name__ == "__main__":
    main()

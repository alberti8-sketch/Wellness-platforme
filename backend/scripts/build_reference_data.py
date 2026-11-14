"""Rebuild the bundled health reference from the supplied CNAM workbook."""
import json
import sys
from pathlib import Path
from app.department_health import parse_department_health


ROOT = Path(__file__).resolve().parents[2]


def build():
    territories = json.loads((ROOT / "frontend/data/wp25-territories.json").read_text())
    # Raw CNAM workbook from the team Drive (not versioned): pass its path or put it in context/.
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "context/2024_effectif-departemental-par-pathologie-sexe-age_serie-annuelle.xls"
    if not source.exists():
        raise SystemExit(f"Classeur CNAM introuvable : {source} (à télécharger depuis le Drive)")
    health = parse_department_health(source.read_bytes(), source.name)
    if set(health["departments"]) != {city["department_code"] for city in territories}:
        raise ValueError("Reference health workbook does not cover all eight city departments")
    (ROOT / "frontend/data/department-health-2024.json").write_text(
        json.dumps(health, indent=2, ensure_ascii=True) + "\n"
    )


if __name__ == "__main__":
    build()

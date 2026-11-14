"""Rebuild the bundled health reference from the supplied CNAM workbook."""
import json
from pathlib import Path
from app.department_health import parse_department_health


ROOT = Path(__file__).resolve().parents[2]


def build():
    territories = json.loads((ROOT / "frontend/data/wp25-territories.json").read_text())
    source = ROOT / "context/2024_effectif-departemental-par-pathologie-sexe-age_serie-annuelle.xls"
    health = parse_department_health(source.read_bytes(), source.name)
    if set(health["departments"]) != {city["department_code"] for city in territories}:
        raise ValueError("Reference health workbook does not cover all eight city departments")
    (ROOT / "frontend/data/department-health-2024.json").write_text(
        json.dumps(health, indent=2, ensure_ascii=True) + "\n"
    )


if __name__ == "__main__":
    build()

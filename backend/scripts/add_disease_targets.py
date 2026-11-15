"""Add the prevalence of every disease group of the commune report to the decision-tree dataset.

The full dataset build (scripts/build_ml_dataset.py) makes hundreds of calls; this script only adds or
refreshes the `prev_<disease>` target columns of data/ml/departements_<year>.csv with one Assurance Maladie
request (all departments, all the groups of diseases.DISEASES).

    python -m scripts.add_disease_targets [--year 2024]
"""

from __future__ import annotations

import csv
import sys

import diseases
import ml_tree
from scripts.build_ml_dataset import ameli


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    year = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else ml_tree.YEAR
    path = ml_tree.ml_dir() / f"departements_{year}.csv"
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    key_of = {top: key for key, (top, *_) in diseases.DISEASES.items()}
    tops = ",".join(f'"{t}"' for t in key_of)
    found = ameli(f"annee=date'{year}' and sexe=9 and cla_age_5=\"tsage\" and top in ({tops})", "dept,top,prev")
    prev: dict[str, dict[str, float]] = {}
    for r in found:
        if r.get("prev") is not None:
            prev.setdefault(r["dept"], {})[key_of[r["top"]]] = round(float(r["prev"]), 3)

    for r in rows:
        for key in diseases.DISEASES:
            r[f"prev_{key}"] = prev.get(r["dept"], {}).get(key, r.get(f"prev_{key}", ""))
    fields = list(rows[0])
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    filled = {k: sum(1 for r in rows if r[f"prev_{k}"] not in ("", None)) for k in diseases.DISEASES}
    print(f"{len(rows)} départements → {path}")
    for k, n in filled.items():
        print(f"  prev_{k}: {n}")


if __name__ == "__main__":
    main()

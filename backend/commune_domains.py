"""Commune-level « domain map » data (built by scripts/build_commune_domains.py)."""

from __future__ import annotations

import csv
import math
from functools import lru_cache
from typing import Any

from ml_tree import DatasetMissing, ml_dir

FILE = "communes_domaines_2024.csv"
WALK_CLASSES = ["A+", "A", "B", "C", "D", "E", "F", "G"]  # best → worst

SOURCES = {
    "walk": "Baromètre des villes marchables 2023 (Place aux piétons)",
    "bike": "Vélo & Territoires 2024, cyclabilité et stationnement par commune",
    "sirene": "SIRENE (INSEE), établissements actifs",
    "sport": "Recensement des équipements sportifs (ministère des Sports)",
    "injep": "INJEP / CRÉDOC, Baromètre national des pratiques sportives 2023",
    "geo": "INSEE (geo.api.gouv.fr), population légale",
}

# key → metadata; "direction": which end is better for health (None = context only).
INDICATORS: dict[str, dict[str, Any]] = {
    "walk_score": {"domain": "marche", "label": "Indice de marchabilité", "unit": "/20", "direction": "higher_is_better",
                   "source": SOURCES["walk"], "classes": "walk"},
    "walk_safety": {"domain": "marche", "label": "Sécurité du piéton", "unit": "/20", "direction": "higher_is_better", "source": SOURCES["walk"]},
    "walk_comfort": {"domain": "marche", "label": "Confort de la marche", "unit": "/20", "direction": "higher_is_better", "source": SOURCES["walk"]},
    "walk_effort": {"domain": "marche", "label": "Effort de la ville", "unit": "/20", "direction": "higher_is_better", "source": SOURCES["walk"]},
    "walk_services": {"domain": "marche", "label": "Aménagements et services", "unit": "/20", "direction": "higher_is_better", "source": SOURCES["walk"]},
    "bike_share": {"domain": "velo", "label": "Voirie avec aménagement cyclable", "unit": "%", "direction": "higher_is_better", "source": SOURCES["bike"]},
    "bike_parking_1000": {"domain": "velo", "label": "Places de stationnement vélo pour 1 000 hab.", "unit": "pour 1 000 hab.",
                          "direction": "higher_is_better", "source": SOURCES["bike"]},
    "fastfood_10k": {"domain": "alimentation", "label": "Fast-foods et snacks pour 10 000 hab.", "unit": "pour 10 000 hab.",
                     "direction": "lower_is_better", "source": f"{SOURCES['sirene']}, NAF 56.10C"},
    "restaurant_10k": {"domain": "alimentation", "label": "Restaurants traditionnels pour 10 000 hab.", "unit": "pour 10 000 hab.",
                       "direction": None, "source": f"{SOURCES['sirene']}, NAF 56.10A"},
    "sport_10k": {"domain": "sport", "label": "Équipements sportifs pour 10 000 hab.", "unit": "pour 10 000 hab.",
                  "direction": "higher_is_better", "source": SOURCES["sport"]},
    "gp_10k": {"domain": "sante", "label": "Cabinets de médecine générale pour 10 000 hab.", "unit": "pour 10 000 hab.",
               "direction": "higher_is_better", "source": f"{SOURCES['sirene']}, NAF 86.21Z"},
    "density_km2": {"domain": "contexte", "label": "Densité de population", "unit": "hab./km²", "direction": None, "source": SOURCES["geo"]},
}

# INJEP / CRÉDOC, Baromètre national des pratiques sportives 2023 (p. 33): share of people practising a sport,
# by size of urban area. National survey (~4,000 people) — context for a commune, not a local measurement.
SPORT_RATE_2023: dict[str, dict[str, Any]] = {
    "rural": {"rate": 65, "label": "communes rurales"},
    "2k-20k": {"rate": 66, "label": "agglomérations de 2 000 à 20 000 hab."},
    "20k-100k": {"rate": 70, "label": "agglomérations de 20 000 à 100 000 hab."},
    "100k+": {"rate": 72, "label": "agglomérations de plus de 100 000 hab."},
    "paris": {"rate": 79, "label": "agglomération parisienne"},
}

TEXT = {"code", "name", "dep", "walk_class", "size_class"}


def _num(v: str) -> float | None:
    if v in ("", None):
        return None
    x = float(v)
    return None if math.isnan(x) else x


@lru_cache(maxsize=1)
def load() -> dict[str, Any]:
    path = ml_dir() / FILE
    if not path.exists():
        raise DatasetMissing(f"Jeu de données communal absent ({path.name}) : lancez python -m scripts.build_commune_domains")
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    columns = list(rows[0].keys()) if rows else []
    data = [[r[c] if c in TEXT else _num(r[c]) for c in columns] for r in rows]
    return {"columns": columns, "rows": data}

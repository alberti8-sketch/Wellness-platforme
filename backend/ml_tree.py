"""Decision tree predicting chronic-disease prevalence from territory characteristics.

Training unit: the 96 metropolitan departments (data/ml/departements_<year>.csv, built by
scripts/build_ml_dataset.py). One regression tree per pathology, deliberately shallow so every
prediction can be read as a short chain of rules.

Honesty rules:
  * performance is measured by 5-fold cross-validation and compared with a naive baseline (the mean);
  * the tree learns associations between departments, not causes;
  * for a commune, some inputs exist at commune level (density, fast food, sport) and the age structure
    is inherited from its department — the response says which.
"""

from __future__ import annotations

import csv
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.tree import DecisionTreeRegressor

ROOT = Path(__file__).resolve().parents[1]
YEAR = 2024
MAX_DEPTH = 3
MIN_SAMPLES_LEAF = 8
SEED = 0


def ml_dir() -> Path:
    return Path(os.getenv("WELLNESS_ML_DIR", ROOT / "data" / "ml"))


FEATURES: dict[str, dict[str, str]] = {
    "pct_65plus": {"label": "Part des 65 ans et plus", "unit": "%", "source": "Assurance Maladie — population couverte par âge"},
    "density_km2": {"label": "Densité de population", "unit": "hab./km²", "source": "geo.api.gouv.fr (INSEE)"},
    "poverty_rate": {"label": "Taux de pauvreté", "unit": "%", "source": "INSEE, 2021 (taux de pauvreté monétaire)"},
    "fastfood_per10k": {"label": "Restauration rapide pour 10 000 hab.", "unit": "/10k hab.", "source": "SIRENE — NAF 56.10C, entreprises actives"},
    "sport_per10k": {"label": "Équipements sportifs pour 10 000 hab.", "unit": "/10k hab.", "source": "Recensement des équipements sportifs (ministère des Sports)"},
}
# Only measured per department: a commune inherits its department's value.
DEPARTMENT_ONLY = {"pct_65plus", "poverty_rate"}

PATHOS: dict[str, str] = {
    "diabete": "Diabète",
    "cardio": "Maladies cardioneurovasculaires",
    "respiratoire": "Maladies respiratoires chroniques",
    "cancers": "Cancers",
}


class DatasetMissing(Exception):
    pass


def _read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise DatasetMissing(f"Jeu d'entraînement absent : {path.name} (lancer python -m scripts.build_ml_dataset)")
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(v: str | None) -> float | None:
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


@dataclass
class TrainedTree:
    patho: str
    model: DecisionTreeRegressor
    depts: list[dict[str, Any]]  # training rows (code, name, features, target)
    leaf_of: dict[str, int]
    metrics: dict[str, float]
    importances: dict[str, float]


@lru_cache(maxsize=None)
def load_departements() -> tuple[dict[str, Any], ...]:
    rows = []
    for r in _read_csv(ml_dir() / f"departements_{YEAR}.csv"):
        rows.append({
            "code": r["dept"], "name": r["name"],
            "features": {k: _num(r.get(k)) for k in FEATURES},
            "targets": {p: _num(r.get(f"prev_{p}")) for p in PATHOS},
        })
    return tuple(rows)


@lru_cache(maxsize=None)
def load_communes() -> dict[str, dict[str, Any]]:
    path = ml_dir() / f"communes_{YEAR}.csv"
    if not path.exists():
        return {}
    out = {}
    for r in _read_csv(path):
        out[r["code"]] = {"dept": r["dept"], "features": {k: _num(r.get(k)) for k in FEATURES},
                          "levels": {k: ("departement" if k in DEPARTMENT_ONLY else "commune") for k in FEATURES}}
    return out


@lru_cache(maxsize=None)
def train(patho: str) -> TrainedTree:
    if patho not in PATHOS:
        raise KeyError(patho)
    rows = [r for r in load_departements()
            if r["targets"][patho] is not None and all(v is not None for v in r["features"].values())]
    X = np.array([[r["features"][k] for k in FEATURES] for r in rows])
    y = np.array([r["targets"][patho] for r in rows])

    def make() -> DecisionTreeRegressor:
        return DecisionTreeRegressor(max_depth=MAX_DEPTH, min_samples_leaf=MIN_SAMPLES_LEAF, random_state=SEED)

    cv = KFold(n_splits=5, shuffle=True, random_state=SEED)
    pred_cv = cross_val_predict(make(), X, y, cv=cv)
    # Baseline: predict the training-fold mean.
    base = np.empty_like(y)
    for tr, te in cv.split(X):
        base[te] = y[tr].mean()
    mae = float(np.mean(np.abs(pred_cv - y)))
    mae_base = float(np.mean(np.abs(base - y)))
    ss_res = float(np.sum((pred_cv - y) ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))

    model = make().fit(X, y)
    leaves = model.apply(X)
    return TrainedTree(
        patho=patho,
        model=model,
        depts=[{"code": r["code"], "name": r["name"], "features": r["features"], "target": r["targets"][patho]} for r in rows],
        leaf_of={r["code"]: int(leaf) for r, leaf in zip(rows, leaves, strict=True)},
        metrics={
            "n": len(rows),
            "mae_cv": round(mae, 3),
            "mae_baseline": round(mae_base, 3),
            "gain_vs_baseline_pct": round(100 * (1 - mae / mae_base), 1) if mae_base else 0.0,
            "r2_cv": round(1 - ss_res / ss_tot, 3) if ss_tot else 0.0,
            "target_mean": round(float(y.mean()), 3),
            "target_min": round(float(y.min()), 3),
            "target_max": round(float(y.max()), 3),
        },
        importances={k: round(float(v), 3) for k, v in zip(FEATURES, model.feature_importances_, strict=True)},
    )


def tree_json(t: TrainedTree) -> list[dict[str, Any]]:
    """Flat node list (id 0 = root). Leaves carry the departments they contain."""
    tr = t.model.tree_
    keys = list(FEATURES)
    members: dict[int, list[dict[str, Any]]] = {}
    for d in t.depts:
        members.setdefault(t.leaf_of[d["code"]], []).append({"code": d["code"], "name": d["name"], "prev": d["target"]})
    nodes = []
    for i in range(tr.node_count):
        leaf = tr.children_left[i] == -1
        nodes.append({
            "id": i,
            "leaf": bool(leaf),
            "feature": None if leaf else keys[tr.feature[i]],
            "threshold": None if leaf else round(float(tr.threshold[i]), 2),
            "left": None if leaf else int(tr.children_left[i]),   # condition true: feature <= threshold
            "right": None if leaf else int(tr.children_right[i]),
            "value": round(float(tr.value[i][0][0]), 3),
            "samples": int(tr.n_node_samples[i]),
            "departements": sorted(members.get(i, []), key=lambda m: -(m["prev"] or 0)) if leaf else None,
        })
    return nodes


def predict(t: TrainedTree, features: dict[str, float]) -> dict[str, Any]:
    tr = t.model.tree_
    keys = list(FEATURES)
    node, path = 0, []
    while tr.children_left[node] != -1:
        k = keys[tr.feature[node]]
        thr = float(tr.threshold[node])
        go_left = features[k] <= thr
        path.append({"node": node, "feature": k, "threshold": round(thr, 2), "value": features[k], "condition": "<=" if go_left else ">"})
        node = int(tr.children_left[node] if go_left else tr.children_right[node])
    return {"prediction": round(float(tr.value[node][0][0]), 3), "leaf": node, "path": path}

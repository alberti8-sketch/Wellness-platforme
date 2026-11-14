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
# Map-only columns of the dataset (descriptive, not tree features): the veterinary density did not
# improve any prediction in cross-validation, and the Framingham estimate is derived from diabetes.
EXTRA_COLUMNS = ("framingham_10y", "vet_per10k", "icp", "prev_sub_depistage", "prev_sub_vaccination",
                 "depistage_sein", "depistage_colorectal", "depistage_col", "vacc_grippe65", "vacc_hpv", "vacc_ror")

# Only measured per department: a commune inherits its department's value.
DEPARTMENT_ONLY = {"pct_65plus", "poverty_rate"}

# Diabetes is the single disease used as an example in the product (other pathologies removed).
PATHOS: dict[str, str] = {"diabete": "Diabète"}


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
            "extras": {k: _num(r.get(k)) for k in EXTRA_COLUMNS},
            "prevention_type": r.get("prevention_type") or None,
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


# ---- Walking and cycling studies: do they help predict the disease? ----
STUDY_FACTORS: dict[str, dict[str, str]] = {
    "bike_share": {"label": "Voirie avec aménagement cyclable", "unit": "%", "source": "Vélo & Territoires 2024 (toutes les communes)"},
    "bike_parking_1000": {"label": "Stationnement vélo pour 1 000 hab.", "unit": "/1 000 hab.", "source": "Vélo & Territoires 2024"},
    "walk_score": {"label": "Indice de marchabilité", "unit": "/20", "source": "Baromètre des villes marchables 2023 (communes notées, moyenne pondérée)"},
}
CV_REPEATS = 10


def load_mobility() -> dict[str, dict[str, float | None]]:
    path = ml_dir() / f"departements_mobilite_{YEAR}.csv"
    if not path.exists():
        return {}
    return {r["dept"]: {k: _num(r.get(k)) for k in STUDY_FACTORS} for r in _read_csv(path)}


def _cv_r2(X: np.ndarray, y: np.ndarray) -> float:
    """Cross-validated R², averaged over several fold splits (small sample: one split is noisy)."""
    scores = []
    for seed in range(CV_REPEATS):
        cv = KFold(n_splits=5, shuffle=True, random_state=seed)
        p = cross_val_predict(DecisionTreeRegressor(max_depth=MAX_DEPTH, min_samples_leaf=MIN_SAMPLES_LEAF, random_state=SEED), X, y, cv=cv)
        scores.append(1 - float(np.sum((p - y) ** 2)) / float(np.sum((y - y.mean()) ** 2)))
    return float(np.mean(scores))


@lru_cache(maxsize=None)
def factor_study(patho: str) -> dict[str, Any]:
    """For each walking / cycling factor: raw correlation with the prevalence, correlation once poverty and
    age are accounted for (partial), and the change of cross-validated R² when the factor is added to the tree."""
    mob = load_mobility()
    rows = [r for r in load_departements()
            if r["targets"][patho] is not None and all(v is not None for v in r["features"].values())]
    base_X = np.array([[r["features"][k] for k in FEATURES] for r in rows])
    y = np.array([r["targets"][patho] for r in rows])
    r2_base = _cv_r2(base_X, y)
    out = []
    for key, meta in STUDY_FACTORS.items():
        vals = np.array([mob.get(r["code"], {}).get(key) for r in rows], dtype=float)
        ok = ~np.isnan(vals)
        n = int(ok.sum())
        if n < 20:
            continue
        x, yy = vals[ok], y[ok]
        controls = np.c_[np.ones(n), base_X[ok][:, list(FEATURES).index("poverty_rate")], base_X[ok][:, list(FEATURES).index("pct_65plus")]]

        def resid(z: np.ndarray, c: np.ndarray = controls) -> np.ndarray:
            return z - c @ np.linalg.lstsq(c, z, rcond=None)[0]

        r_raw = float(np.corrcoef(x, yy)[0, 1])
        r_partial = float(np.corrcoef(resid(x), resid(yy))[0, 1])
        # The tree handles missing values (scikit-learn ≥ 1.3): departments without a rated commune stay in.
        r2_with = _cv_r2(np.c_[base_X, vals], y)
        out.append({
            "key": key, **meta, "n": n,
            "r": round(r_raw, 2), "r_partial": round(r_partial, 2),
            "r2_with": round(r2_with, 3), "r2_gain": round(r2_with - r2_base, 3),
            "helps_prediction": r2_with - r2_base >= 0.02,
        })
    return {"patho": patho, "n": len(rows), "r2_base": round(r2_base, 3), "controls": ["poverty_rate", "pct_65plus"], "factors": out}

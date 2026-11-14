"""Disease prediction by decision tree (trained on the 96 metropolitan departments)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

import ml_tree
from config import Principal
from geo import territory_level, territory_name
from security import get_principal

router = APIRouter(prefix="/api/prediction", tags=["prediction"])

CAVEAT = (
    "Arbre entraîné sur les 96 départements de métropole : il décrit des associations entre territoires, "
    "pas des causes. Pour une commune, la structure par âge et le taux de pauvreté sont ceux de son département."
)


def _tree(patho: str) -> ml_tree.TrainedTree:
    if patho not in ml_tree.PATHOS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Pathologie inconnue : {patho} (choix : {', '.join(ml_tree.PATHOS)})")
    try:
        return ml_tree.train(patho)
    except ml_tree.DatasetMissing as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


@router.get("/model")
def model(patho: str = "diabete", _: Principal = Depends(get_principal)) -> dict[str, Any]:
    t = _tree(patho)
    return {
        "patho": patho,
        "label": ml_tree.PATHOS[patho],
        "pathologies": ml_tree.PATHOS,
        "year": ml_tree.YEAR,
        "unit": "% (prévalence tous âges, deux sexes)",
        "features": ml_tree.FEATURES,
        "params": {"max_depth": ml_tree.MAX_DEPTH, "min_samples_leaf": ml_tree.MIN_SAMPLES_LEAF},
        "metrics": t.metrics,
        "importances": t.importances,
        "nodes": ml_tree.tree_json(t),
        "source": "Cible : Assurance Maladie (data.ameli.fr). Variables : Assurance Maladie, INSEE (geo.api), SIRENE, Recensement des équipements sportifs.",
        "caveat": CAVEAT,
    }


def _dept_row(code: str) -> dict[str, Any] | None:
    return next((r for r in ml_tree.load_departements() if r["code"] == code), None)


@router.get("/territories")
def territories(
    territories: str = Query(..., max_length=2000, description="Codes INSEE (communes ou départements), séparés par des virgules"),
    patho: str = "diabete",
    _: Principal = Depends(get_principal),
) -> dict[str, Any]:
    t = _tree(patho)
    communes = ml_tree.load_communes()
    out: dict[str, Any] = {}
    for code in [c.strip().upper() for c in territories.split(",") if c.strip()][:50]:
        level = territory_level(code)
        if level is None:
            out[code] = {"error": "Code INSEE inconnu"}
            continue
        dept = code if level == "departement" else (code[:3] if code.startswith("97") else code[:2])
        drow = _dept_row(dept)
        if drow is None:
            out[code] = {"error": "Département hors du périmètre d'entraînement (métropole)"}
            continue
        if level == "commune" and code in communes:
            feats, levels = communes[code]["features"], communes[code]["levels"]
        else:
            feats, levels = drow["features"], {k: "departement" for k in ml_tree.FEATURES}
        if any(v is None for v in feats.values()):
            out[code] = {"error": "Variables incomplètes pour ce territoire"}
            continue
        p = ml_tree.predict(t, feats)
        observed = drow["targets"][patho]
        out[code] = {
            "name": territory_name(code),
            "departement": dept,
            "features": feats,
            "feature_levels": levels,
            **p,
            "observed_departement": observed,
            "gap": round(p["prediction"] - observed, 3) if observed is not None else None,
            "error": None,
        }
    return {"patho": patho, "label": ml_tree.PATHOS[patho], "caveat": CAVEAT, "territories": out}


class SimulateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    patho: str = "diabete"
    pct_65plus: float = Field(ge=0, le=100)
    density_km2: float = Field(ge=0, le=100_000)
    poverty_rate: float = Field(ge=0, le=100)
    fastfood_per10k: float = Field(ge=0, le=1_000)
    sport_per10k: float = Field(ge=0, le=1_000)


@router.post("/simulate")
def simulate(body: SimulateIn, _: Principal = Depends(get_principal)) -> dict[str, Any]:
    t = _tree(body.patho)
    return {"patho": body.patho, **ml_tree.predict(t, body.model_dump(exclude={"patho"}))}


DEPARTEMENT_TARGETS: dict[str, dict[str, str]] = {
    f"prev_{k}": {"label": f"Prévalence — {v}", "unit": "%", "source": "Assurance Maladie — data.ameli.fr", "direction": "lower_is_better"}
    for k, v in ml_tree.PATHOS.items()
}
DEPARTEMENT_FEATURE_DIRECTION = {
    "pct_65plus": None,  # descriptive, neither better nor worse
    "density_km2": None,
    "poverty_rate": "lower_is_better",
    "fastfood_per10k": "lower_is_better",
    "sport_per10k": "higher_is_better",
}


@router.get("/departements")
def departements(_: Principal = Depends(get_principal)) -> dict[str, Any]:
    """Department-level indicators of the training set (96 metropolitan departments), for the map."""
    try:
        rows = ml_tree.load_departements()
    except ml_tree.DatasetMissing as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    indicators = {
        **DEPARTEMENT_TARGETS,
        "framingham_10y": {
            "label": "Risque cardiovasculaire à 10 ans (Framingham, estimé)",
            "unit": "%",
            "source": "Modèle de Framingham (D'Agostino 2008), données Assurance Maladie",
            "direction": "lower_is_better",
        },
        "vet_per10k": {
            "label": "Cabinets vétérinaires pour 10 000 hab.",
            "unit": "/10k hab.",
            "source": "SIRENE — NAF 75.00Z, entreprises actives (indicateur « One Health » de présence animale)",
            "direction": None,
        },
        **{k: {**v, "direction": DEPARTEMENT_FEATURE_DIRECTION[k]} for k, v in ml_tree.FEATURES.items()},
    }
    return {
        "year": ml_tree.YEAR,
        "indicators": indicators,
        "departements": [
            {"code": r["code"], "name": r["name"],
             "values": {**r["features"], **r.get("extras", {}), **{f"prev_{p}": v for p, v in r["targets"].items()}}}
            for r in rows
        ],
    }

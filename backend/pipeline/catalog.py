"""Indicator catalog — the single source of truth for scoring rules.

Dimensions and weights follow the team document « PONDERATION 3 » (MVP WP, March 2025):

    Sport 30 % · Environnement 25 % · Health care 30 % · Social 15 %

Chronic-disease prevalence is kept as an OUTCOME dimension (weight 0 by default): it is
displayed and used to calibrate the weights, never mixed into the behaviour index.

Every indicator declares a direction and a FIXED reference range [ref_min, ref_max] mapped
onto the 1–10 scale. The WP25 dimension scores are already expressed out of 100, so their
reference range is simply 0–100. Other ranges are placeholders to be validated by a
public-health expert.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Direction(StrEnum):
    HIGHER_IS_BETTER = "higher_is_better"
    LOWER_IS_BETTER = "lower_is_better"


@dataclass(frozen=True)
class Dimension:
    code: str
    label: str
    description: str
    default_weight: float
    is_outcome: bool = False


@dataclass(frozen=True)
class Indicator:
    code: str
    label: str
    dimension: str
    unit: str
    direction: Direction
    ref_min: float
    ref_max: float
    hard_min: float
    hard_max: float
    weight: float = 1.0
    source_hint: str = ""


DIMENSIONS: dict[str, Dimension] = {
    d.code: d
    for d in [
        Dimension("SPORT", "Sport", "Offre et pratique sportive, activité physique", 30),
        Dimension("ENV", "Environnement", "Qualité de l'air, nature, cadre de vie", 25),
        Dimension("HEALTH", "Offre de soins", "Accès et offre de soins (health care)", 30),
        Dimension("SOCIAL", "Social", "Précarité et inégalités sociales", 15),
        Dimension("CLIN", "Maladies chroniques",
                  "Prévalence des maladies chroniques (indicateur de résultat)", 0, is_outcome=True),
    ]
}

H, L = Direction.HIGHER_IS_BETTER, Direction.LOWER_IS_BETTER

INDICATORS: dict[str, Indicator] = {
    i.code: i
    for i in [
        Indicator("sport_score", "Score sport (WP)", "SPORT", "/100", H, 0, 100, 0, 100,
                  source_hint="WP25 — onglets CITY / middle CiTY / COUNTRY SIDE, colonne SPORT"),
        Indicator("env_score", "Score environnement (WP)", "ENV", "/100", H, 0, 100, 0, 100,
                  source_hint="WP25 — colonne ENVIRONMENT"),
        Indicator("health_care_score", "Score offre de soins (WP)", "HEALTH", "/100", H, 0, 100, 0, 100,
                  source_hint="WP25 — colonne HEALTH CARE"),
        Indicator("social_qpv_pct", "Part de la population en quartier prioritaire (QPV)", "SOCIAL", "%", L,
                  0, 30, 0, 100,
                  source_hint="WP25 — population QPV / population ; ANCT pop_QPV24_2020"),
        Indicator("clin_diabetes_pct", "Prévalence du diabète", "CLIN", "%", L, 3, 9, 0, 100,
                  source_hint="Assurance Maladie — effectifs par pathologie (Drive : DATA & PONDERATION)"),
        Indicator("clin_cardio_pct", "Prévalence des maladies cardio-neurovasculaires", "CLIN", "%", L, 4, 12, 0, 100,
                  source_hint="Assurance Maladie — Data pathologies"),
        Indicator("clin_obesity_pct", "Prévalence de l'obésité adulte", "CLIN", "%", L, 8, 25, 0, 100,
                  source_hint="Santé publique France"),
    ]
}

# Identification columns every uploaded sheet must carry.
ID_COLUMNS: tuple[str, ...] = ("territory_code", "territory_name", "period")

# Context columns: validated and displayed, but never scored.
TERRITORY_TYPES = ("urbain", "semi-urbain", "rural")
CONTEXT_COLUMNS: dict[str, str] = {
    "territory_type": "Typologie : urbain / semi-urbain / rural (comparaison entre territoires de même type)",
    "population": "Population (habitants)",
    "density_km2": "Densité (hab./km²)",
    "source_global_score": "Score global fourni par la source (/100), affiché pour comparaison",
}

SCORE_MIN, SCORE_MAX = 1.0, 10.0
BANDS: tuple[tuple[str, str, float], ...] = (
    ("best", "Best", 7.0),
    ("middle", "Middle", 4.0),
    ("bad", "Bad", SCORE_MIN),
)

MIN_DIMENSION_COVERAGE = 0.5


def indicators_of(dimension: str) -> list[Indicator]:
    return [i for i in INDICATORS.values() if i.dimension == dimension]


def default_weights() -> dict[str, float]:
    return {code: d.default_weight for code, d in DIMENSIONS.items()}

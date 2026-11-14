"""Indicator catalog — the single source of truth for scoring rules.

Every indicator declares:
  * its dimension (PA, MOB, ENV, NUT, CLIN),
  * a direction (is a higher raw value better or worse?),
  * a FIXED reference range [ref_min, ref_max] used to map raw values onto 1–10,
  * hard physical bounds [hard_min, hard_max] outside which a value is rejected.

Reference ranges are deliberately fixed (national/expert references, WHO
guidelines…) rather than computed from the uploaded batch: with only a handful
of territories a min-max over the batch would always produce one "1" and one
"10", which is meaningless.

The reference values below are PLACEHOLDERS for the MVP and must be validated
by a public-health expert before any real use.
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
    is_outcome: bool = False  # outcome (disease burden) vs. behaviour/environment


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
        Dimension("PA", "Activité physique", "Niveau d'activité et sédentarité", 30),
        Dimension("MOB", "Mobilité", "Mobilité active et dépendance à la voiture", 25),
        Dimension("ENV", "Environnement", "Pollution de l'air et espaces verts", 25),
        Dimension("NUT", "Nutrition", "Habitudes et environnement alimentaires", 20),
        Dimension(
            "CLIN",
            "Maladies chroniques",
            "Prévalence des maladies chroniques (indicateur de résultat)",
            0,  # outcome: excluded from the wellness index by default, used for calibration
            is_outcome=True,
        ),
    ]
}

H, L = Direction.HIGHER_IS_BETTER, Direction.LOWER_IS_BETTER

INDICATORS: dict[str, Indicator] = {
    i.code: i
    for i in [
        # --- Physical activity -------------------------------------------------
        Indicator("pa_active_adults_pct", "Adultes atteignant les recommandations OMS", "PA", "%", H,
                  20, 70, 0, 100, source_hint="Santé publique France — Baromètre santé"),
        Indicator("pa_sport_licences_per100", "Licences sportives pour 100 hab.", "PA", "/100 hab.", H,
                  10, 35, 0, 100, source_hint="INJEP — recensement des licences"),
        Indicator("pa_sedentary_hours", "Temps assis quotidien", "PA", "h/jour", L,
                  4, 10, 0, 24, source_hint="Enquêtes déclaratives / capteurs (phase biobanque)"),
        # --- Mobility ----------------------------------------------------------
        Indicator("mob_active_commute_pct", "Trajets domicile-travail à pied ou à vélo", "MOB", "%", H,
                  2, 40, 0, 100, source_hint="INSEE RP — MOBPRO"),
        Indicator("mob_car_commute_pct", "Trajets domicile-travail en voiture", "MOB", "%", L,
                  20, 90, 0, 100, source_hint="INSEE RP — MOBPRO"),
        Indicator("mob_daily_steps", "Nombre moyen de pas par jour", "MOB", "pas/jour", H,
                  3000, 10000, 0, 50000, source_hint="Données objets connectés agrégées (phase biobanque)"),
        # --- Environment -------------------------------------------------------
        Indicator("env_pm25_ugm3", "Concentration moyenne PM2.5", "ENV", "µg/m³", L,
                  5, 15, 0, 200, source_hint="Geod'air / Atmo — seuil OMS 2021 : 5 µg/m³"),
        Indicator("env_no2_ugm3", "Concentration moyenne NO₂", "ENV", "µg/m³", L,
                  10, 40, 0, 300, source_hint="Geod'air / Atmo — seuil OMS 2021 : 10 µg/m³"),
        Indicator("env_green_space_pct", "Part de surface en espaces verts", "ENV", "%", H,
                  2, 40, 0, 100, source_hint="Corine Land Cover / OSM"),
        # --- Nutrition ---------------------------------------------------------
        Indicator("nut_fruit_veg_pct", "Adultes consommant 5 fruits et légumes par jour", "NUT", "%", H,
                  20, 60, 0, 100, source_hint="Santé publique France — Esteban"),
        Indicator("nut_fastfood_per10k", "Restauration rapide pour 10 000 hab.", "NUT", "/10k hab.", L,
                  2, 12, 0, 1000, source_hint="INSEE — Base permanente des équipements"),
        # --- Clinical outcomes (disease prevalence) ----------------------------
        Indicator("clin_diabetes_pct", "Prévalence du diabète", "CLIN", "%", L,
                  3, 9, 0, 100, source_hint="Assurance Maladie — Data pathologies"),
        Indicator("clin_cardio_pct", "Prévalence des maladies cardio-neurovasculaires", "CLIN", "%", L,
                  4, 12, 0, 100, source_hint="Assurance Maladie — Data pathologies"),
        Indicator("clin_obesity_pct", "Prévalence de l'obésité adulte", "CLIN", "%", L,
                  8, 25, 0, 100, source_hint="Santé publique France"),
        Indicator("clin_respiratory_pct", "Prévalence des maladies respiratoires chroniques", "CLIN", "%", L,
                  2, 8, 0, 100, source_hint="Assurance Maladie — Data pathologies"),
    ]
}

# Columns every uploaded sheet must carry, in addition to indicator columns.
ID_COLUMNS: tuple[str, ...] = ("territory_code", "territory_name", "period")

# Score bands on the 1–10 scale. Lower bound inclusive.
SCORE_MIN, SCORE_MAX = 1.0, 10.0
BANDS: tuple[tuple[str, str, float], ...] = (
    # (code, label, lower bound)
    ("best", "Best", 7.0),
    ("middle", "Middle", 4.0),
    ("bad", "Bad", SCORE_MIN),
)

# A dimension score is only published if at least this share of its
# indicators (by weight) is present.
MIN_DIMENSION_COVERAGE = 0.5


def indicators_of(dimension: str) -> list[Indicator]:
    return [i for i in INDICATORS.values() if i.dimension == dimension]


def default_weights() -> dict[str, float]:
    return {code: d.default_weight for code, d in DIMENSIONS.items()}

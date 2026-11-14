"""Framingham 10-year general cardiovascular risk — territorial (population-averaged) estimate.

Model: D'Agostino RB et al., « General cardiovascular risk profile for use in primary care: the
Framingham Heart Study », Circulation 2008;117:743-753 — office-based (non-laboratory) model, which
uses BMI instead of cholesterol:

    risk = 1 − S0(10) ^ exp( Σ βᵢ·xᵢ − mean )

with x = ln(age), ln(BMI), ln(SBP) (treated or untreated coefficient), smoker, diabetes.

Territorial estimate (indicative): for each department, the expected risk of its 40–74 year-olds is the
population-weighted mean over sex × 5-year age bands, mixing diabetic / non-diabetic, treated /
untreated and smoker / non-smoker states (assumed independent):
  * department-specific — age-sex structure, diabetes prevalence and antihypertensive-treatment
    prevalence by band (Assurance Maladie, data.ameli.fr);
  * national defaults (not published by department) — systolic blood pressure, BMI and smoking by
    sex and age, approximate French values (Esteban 2014-2016, Baromètre Santé publique France);
    replace them with regional data when available.
Antihypertensive treatment is the CNAM « hors pathologies » aggregate, so it is under-estimated.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Literal

Sex = Literal["M", "F"]

COEF: dict[Sex, dict[str, float]] = {
    "M": {"ln_age": 3.11296, "ln_bmi": 0.79277, "ln_sbp_untreated": 1.85508, "ln_sbp_treated": 1.92672,
          "smoker": 0.70953, "diabetes": 0.53160, "s0": 0.88431, "mean": 23.9388},
    "F": {"ln_age": 2.72107, "ln_bmi": 0.51125, "ln_sbp_untreated": 2.81291, "ln_sbp_treated": 2.88267,
          "smoker": 0.61868, "diabetes": 0.77763, "s0": 0.94833, "mean": 26.0145},
}

# 5-year age bands used (Framingham is validated for 30–74 years).
BANDS = ["40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74"]
MID_AGE = {b: int(b[:2]) + 2.5 for b in BANDS}

# National defaults (approximate) by sex and band — see module docstring.
SBP: dict[Sex, list[float]] = {"M": [125, 127, 130, 133, 136, 139, 142], "F": [116, 119, 123, 127, 131, 135, 139]}
SMOKING: dict[Sex, list[float]] = {"M": [0.30, 0.30, 0.28, 0.25, 0.19, 0.14, 0.10], "F": [0.24, 0.24, 0.22, 0.19, 0.15, 0.10, 0.06]}
BMI: dict[Sex, float] = {"M": 26.3, "F": 25.3}


def risk(sex: Sex, age: float, bmi: float, sbp: float, treated: bool, smoker: bool, diabetic: bool) -> float:
    """Individual 10-year CVD risk (0–1)."""
    c = COEF[sex]
    s = (c["ln_age"] * math.log(age) + c["ln_bmi"] * math.log(bmi)
         + (c["ln_sbp_treated"] if treated else c["ln_sbp_untreated"]) * math.log(sbp)
         + c["smoker"] * smoker + c["diabetes"] * diabetic)
    return 1 - c["s0"] ** math.exp(s - c["mean"])


def band_risk(sex: Sex, band: str, p_diabetes: float, p_treated: float) -> float:
    """Expected risk of a person of that sex/band, mixing the binary states with their probabilities."""
    i = BANDS.index(band)
    age, sbp, p_smoke = MID_AGE[band], SBP[sex][i], SMOKING[sex][i]
    total = 0.0
    for d in (0, 1):
        pd = p_diabetes if d else 1 - p_diabetes
        for t in (0, 1):
            pt = p_treated if t else 1 - p_treated
            for k in (0, 1):
                pk = p_smoke if k else 1 - p_smoke
                total += pd * pt * pk * risk(sex, age, BMI[sex], sbp, bool(t), bool(k), bool(d))
    return total


def population_risk(cells: Mapping[tuple[Sex, str], tuple[float, float, float]]) -> float | None:
    """Population-weighted expected risk (%) of the 40–74 year-olds.

    cells[(sex, band)] = (population, diabetes prevalence %, antihypertensive treatment prevalence %)
    """
    num = den = 0.0
    for (sex, band), (pop, prev_d, prev_t) in cells.items():
        if band not in BANDS or pop <= 0:
            continue
        num += pop * band_risk(sex, band, prev_d / 100, prev_t / 100)
        den += pop
    return round(100 * num / den, 2) if den else None

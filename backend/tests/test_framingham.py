import math

import pytest

from framingham import BANDS, band_risk, population_risk, risk


def test_individual_risk_reference_value():
    # Man, 55 y, BMI 27, SBP 130 untreated, non-smoker, non-diabetic:
    # Σβx = 3.11296·ln55 + 0.79277·ln27 + 1.85508·ln130 = 24.1173 → 1 − 0.88431^exp(0.1785) ≈ 13.7 %
    assert risk("M", 55, 27, 130, False, False, False) == pytest.approx(0.137, abs=0.002)


def test_risk_factors_increase_risk():
    base = risk("F", 60, 25, 130, False, False, False)
    assert risk("F", 70, 25, 130, False, False, False) > base
    assert risk("F", 60, 25, 130, False, True, False) > base
    assert risk("F", 60, 25, 130, False, False, True) > base
    assert risk("F", 60, 25, 150, False, False, False) > base
    assert risk("M", 60, 25, 130, False, False, False) > base  # men higher at equal factors
    assert 0 < base < 1


def test_band_risk_is_monotonic_in_diabetes_prevalence():
    assert band_risk("M", "60-64", 0.20, 0.3) > band_risk("M", "60-64", 0.05, 0.3)


def test_population_risk_weighting():
    young = {("F", "40-44"): (1000, 2.0, 5.0)}
    old = {("M", "70-74"): (1000, 20.0, 40.0)}
    assert population_risk(young) < population_risk(old)
    mixed = population_risk({**young, **old})
    assert population_risk(young) < mixed < population_risk(old)
    assert population_risk({("M", "80-84"): (1000, 20.0, 40.0)}) is None  # outside 40–74
    assert all(not math.isnan(band_risk("F", b, 0.1, 0.2)) for b in BANDS)

from pipeline.catalog import INDICATORS
from pipeline.scoring import aggregate_dimension, band, composite, normalize


def test_normalize_higher_is_better():
    ind = INDICATORS["pa_active_adults_pct"]  # ref 20–70
    assert normalize(20, ind) == 1.0
    assert normalize(70, ind) == 10.0
    assert normalize(45, ind) == 5.5


def test_normalize_lower_is_better_and_clipping():
    ind = INDICATORS["env_pm25_ugm3"]  # ref 5–15, lower is better
    assert normalize(5, ind) == 10.0
    assert normalize(15, ind) == 1.0
    assert normalize(9, ind) == 6.4
    assert normalize(2, ind) == 10.0  # clipped
    assert normalize(40, ind) == 1.0  # clipped


def test_bands():
    assert band(1) == "bad"
    assert band(3.99) == "bad"
    assert band(4) == "middle"
    assert band(6.99) == "middle"
    assert band(7) == "best"
    assert band(None) is None


def test_dimension_coverage_threshold():
    # ENV has 3 indicators; one present = 33% < 50% → no score
    res = aggregate_dimension("ENV", {"env_pm25_ugm3": 8.0, "env_no2_ugm3": None, "env_green_space_pct": None})
    assert res.score is None and res.coverage == 0.33
    res = aggregate_dimension("ENV", {"env_pm25_ugm3": 8.0, "env_no2_ugm3": 6.0, "env_green_space_pct": None})
    assert res.score == 7.0 and res.band == "best" and res.coverage == 0.67


def test_composite_renormalises_missing_dimensions():
    res = composite({"PA": 8.0, "MOB": None, "ENV": 4.0, "NUT": None, "CLIN": 2.0},
                    {"PA": 30, "MOB": 25, "ENV": 25, "NUT": 20, "CLIN": 0})
    # CLIN ignored (weight 0); PA & ENV renormalised: (30*8 + 25*4) / 55
    assert res.score == round((30 * 8 + 25 * 4) / 55, 2)
    assert res.coverage == 0.55


def test_determinism():
    ind = INDICATORS["mob_daily_steps"]
    assert {normalize(7321, ind) for _ in range(100)} == {normalize(7321, ind)}

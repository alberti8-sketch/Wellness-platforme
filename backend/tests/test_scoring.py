from pipeline.catalog import DIMENSIONS, INDICATORS, default_weights
from pipeline.scoring import aggregate_dimension, band, composite, normalize


def test_weights_follow_ponderation_3():
    assert default_weights() == {"SPORT": 30, "ENV": 25, "HEALTH": 30, "SOCIAL": 15, "CLIN": 0}
    assert DIMENSIONS["CLIN"].is_outcome


def test_normalize_wp_scores_out_of_100():
    ind = INDICATORS["sport_score"]  # ref 0–100
    assert normalize(0, ind) == 1.0
    assert normalize(100, ind) == 10.0
    assert normalize(50, ind) == 5.5


def test_normalize_lower_is_better_and_clipping():
    ind = INDICATORS["social_qpv_pct"]  # ref 0–30 %, lower is better
    assert normalize(0, ind) == 10.0
    assert normalize(30, ind) == 1.0
    assert normalize(15, ind) == 5.5
    assert normalize(45, ind) == 1.0  # clipped


def test_bands():
    assert band(1) == "bad"
    assert band(3.99) == "bad"
    assert band(4) == "middle"
    assert band(6.99) == "middle"
    assert band(7) == "best"
    assert band(None) is None


def test_dimension_coverage_threshold():
    # CLIN has 3 indicators; one present = 33 % < 50 % → no score
    res = aggregate_dimension("CLIN", {"clin_diabetes_pct": 8.0})
    assert res.score is None and res.coverage == 0.33
    res = aggregate_dimension("CLIN", {"clin_diabetes_pct": 8.0, "clin_cardio_pct": 6.0})
    assert res.score == 7.0 and res.band == "best" and res.coverage == 0.67


def test_composite_renormalises_missing_dimensions():
    # SOCIAL missing (no QPV data): SPORT/ENV/HEALTH renormalised over 85 % of the weight.
    res = composite({"SPORT": 8.0, "ENV": 4.0, "HEALTH": 6.0, "SOCIAL": None, "CLIN": 2.0}, default_weights())
    assert res.score == round((30 * 8 + 25 * 4 + 30 * 6) / 85, 2)
    assert res.coverage == 0.85


def test_determinism():
    ind = INDICATORS["env_score"]
    assert {normalize(37, ind) for _ in range(100)} == {normalize(37, ind)}


def test_every_dimension_has_a_documented_weight_basis():
    from pipeline.evidence import COMPOSITE_BASIS, WEIGHT_BASIS

    assert set(WEIGHT_BASIS) == set(DIMENSIONS)
    for code, basis in WEIGHT_BASIS.items():
        assert basis.rationale
        # Evidence-based ⇔ quantified associations listed; outcome only for outcome dimensions.
        assert (basis.basis == "evidence") == bool(basis.evidence)
        assert (basis.basis == "outcome") == DIMENSIONS[code].is_outcome
        for src in [e.source for e in basis.evidence if e.source] + list(basis.references):
            assert src.url.startswith("https://")
    assert WEIGHT_BASIS["SPORT"].basis == "evidence"
    assert {WEIGHT_BASIS[c].basis for c in ("ENV", "HEALTH", "SOCIAL")} == {"expert"}
    assert COMPOSITE_BASIS.source is not None

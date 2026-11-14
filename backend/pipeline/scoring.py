"""Pure, deterministic scoring functions (no I/O, no randomness).

raw value --normalize--> indicator score (1–10) --aggregate--> dimension score
dimension scores --weighted mean--> composite wellness index
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

from .catalog import (
    BANDS,
    DIMENSIONS,
    MIN_DIMENSION_COVERAGE,
    SCORE_MAX,
    SCORE_MIN,
    Direction,
    Indicator,
    indicators_of,
)


def _round(x: float) -> float:
    # Fixed rounding so results are byte-for-byte reproducible.
    return round(x + 0.0, 2)


def normalize(value: float, indicator: Indicator) -> float:
    """Map a raw value onto the 1–10 scale using the indicator's fixed reference range.

    Values outside the reference range are clipped to 1 or 10.
    """
    span = indicator.ref_max - indicator.ref_min
    if span <= 0:
        raise ValueError(f"Invalid reference range for {indicator.code}")
    ratio = (value - indicator.ref_min) / span
    if indicator.direction is Direction.LOWER_IS_BETTER:
        ratio = 1.0 - ratio
    ratio = min(1.0, max(0.0, ratio))
    return _round(SCORE_MIN + (SCORE_MAX - SCORE_MIN) * ratio)


def band(score: float | None) -> str | None:
    if score is None or (isinstance(score, float) and math.isnan(score)):
        return None
    for code, _label, lower in BANDS:
        if score >= lower:
            return code
    return BANDS[-1][0]


@dataclass(frozen=True)
class AggregateResult:
    score: float | None
    band: str | None
    coverage: float  # share of weight actually available, 0–1


def aggregate_dimension(dimension: str, indicator_scores: Mapping[str, float | None]) -> AggregateResult:
    """Weighted mean of the available indicator scores of one dimension."""
    indicators = indicators_of(dimension)
    total_w = sum(i.weight for i in indicators)
    avail = [(i.weight, indicator_scores[i.code]) for i in indicators if indicator_scores.get(i.code) is not None]
    avail_w = sum(w for w, _ in avail)
    coverage = _round(avail_w / total_w) if total_w else 0.0
    if not avail or coverage < MIN_DIMENSION_COVERAGE:
        return AggregateResult(None, None, coverage)
    score = _round(sum(w * s for w, s in avail) / avail_w)
    return AggregateResult(score, band(score), coverage)


def composite(dimension_scores: Mapping[str, float | None], weights: Mapping[str, float]) -> AggregateResult:
    """Weighted wellness index across dimensions.

    Missing dimensions are dropped and the remaining weights renormalised;
    `coverage` reports the share of the requested weight that was available.
    """
    requested = {d: max(0.0, float(weights.get(d, 0.0))) for d in DIMENSIONS}
    total_w = sum(requested.values())
    if total_w == 0:
        return AggregateResult(None, None, 0.0)
    avail = [(w, dimension_scores[d]) for d, w in requested.items() if w > 0 and dimension_scores.get(d) is not None]
    avail_w = sum(w for w, _ in avail)
    coverage = _round(avail_w / total_w)
    if not avail:
        return AggregateResult(None, None, coverage)
    score = _round(sum(w * s for w, s in avail) / avail_w)
    return AggregateResult(score, band(score), coverage)

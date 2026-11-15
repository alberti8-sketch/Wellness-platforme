"""Health determinants of a commune, crossed with its diseases, and comparison with similar cities.

* Determinants: each one is measured by platform indicators, compared to the median of the communes
  (or the mean of the departments for department-level data): favourable / unfavourable / average / not measured.
* Disease × determinant links come from the team evidence base (« Liens maladies-habitudes »: meta-analyses),
  plus cancer screening for cancers (secondary prevention). No link is invented: tobacco, alcohol and sleep are
  in the evidence base but have no local data (« non mesuré »).
* Similar cities: tracked cities of the same type with the closest population and density (log scale).
"""

from __future__ import annotations

import math
from typing import Any

import diseases

# key → label, [(indicator key, label, unit, direction, scope)], direction: "up" = higher is better
DETERMINANTS: dict[str, dict[str, Any]] = {
    "activite": {"label": "Activité physique", "indicators": [
        ("sport_10k", "Équipements sportifs / 10 000 hab.", "", "up", "commune"),
        ("bike_share", "Voirie cyclable", "%", "up", "commune"),
        ("walk_score", "Marchabilité", "/20", "up", "commune"),
    ]},
    "alimentation": {"label": "Alimentation et poids", "indicators": [
        ("food_score", "Score alimentation", "/100", "up", "commune"),
        ("fastfood_10k", "Fast-foods / 10 000 hab.", "", "down", "commune"),
        ("fresh_10k", "Commerces de produits frais / 10 000 hab.", "", "up", "commune"),
    ]},
    "cadre": {"label": "Cadre de vie", "indicators": [
        ("land_green_pct", "Espaces verts urbains", "%", "up", "commune"),
        ("land_built_pct", "Sols artificialisés", "%", "down", "commune"),
        ("zone30_share", "Voirie en zone 30", "%", "up", "commune"),
    ]},
    "soins": {"label": "Accès aux soins et dépistage", "indicators": [
        ("gp_10k", "Médecine générale / 10 000 hab.", "", "up", "commune"),
        ("prev_sub_depistage", "Dépistage des cancers (rang)", "/100", "up", "departement"),
    ]},
    "precarite": {"label": "Précarité", "indicators": [
        ("poverty_rate", "Taux de pauvreté", "%", "down", "departement"),
    ]},
    "tabac": {"label": "Tabac", "indicators": []},
    "alcool": {"label": "Alcool", "indicators": []},
    "sommeil": {"label": "Sommeil", "indicators": []},
}

# Habit of the evidence base → determinant.
HABITS = [("activité physique", "activite"), ("sédentarité", "activite"), ("alimentation", "alimentation"), ("sel", "alimentation"),
          ("surpoids", "alimentation"), ("obésité", "alimentation"), ("tabagisme", "tabac"), ("alcool", "alcool"), ("sommeil", "sommeil")]
LEVEL_ORDER = {"fort": 3, "moyen": 2, "modéré": 1}

COMPARE_DISEASES = ["diabete", "cardio", "respiratoire", "psy", "cancers"]


def _status(value: float | None, ref: float | None, direction: str) -> str:
    if value is None or ref is None:
        return "nc"
    if ref == 0:
        better = value > 0 if direction == "up" else value == 0
        return "favorable" if better else "moyen"
    ratio = value / ref
    if direction == "down":
        ratio = 1 / ratio if ratio else math.inf
    return "favorable" if ratio >= 1.1 else "defavorable" if ratio <= 0.9 else "moyen"


def assess(values: dict[str, Any], medians: dict[str, float]) -> list[dict[str, Any]]:
    """Status of each determinant from its indicators (majority of favourable vs unfavourable)."""
    out = []
    for key, d in DETERMINANTS.items():
        inds = []
        for k, label, unit, direction, scope in d["indicators"]:
            v = values.get(k)
            ref = medians.get(k)
            inds.append({"key": k, "label": label, "unit": unit, "direction": direction, "scope": scope,
                         "value": v, "reference": ref, "status": _status(v, ref, direction)})
        known = [i for i in inds if i["status"] != "nc"]
        score = sum(1 if i["status"] == "favorable" else -1 if i["status"] == "defavorable" else 0 for i in known)
        status = "nc" if not known else "favorable" if score > 0 else "defavorable" if score < 0 else "moyen"
        out.append({"key": key, "label": d["label"], "status": status, "indicators": inds})
    return out


def cross(items: list[dict[str, Any]], dets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """For each disease: the determinants linked to it (evidence base), with level and the commune's status."""
    by_key = {d["key"]: d for d in dets}
    out = []
    for item in items:
        links: dict[str, dict[str, Any]] = {}
        for ev in item.get("evidence", []):
            habit = ev["habitude"].lower()
            for word, det in HABITS:
                if word in habit:
                    cur = links.setdefault(det, {"determinant": det, "label": by_key[det]["label"], "level": ev["niveau"].lower(),
                                                 "habits": [], "status": by_key[det]["status"], "source": "base de preuves"})
                    if LEVEL_ORDER.get(ev["niveau"].lower(), 0) > LEVEL_ORDER.get(cur["level"], 0):
                        cur["level"] = ev["niveau"].lower()
                    if ev["habitude"] not in cur["habits"]:
                        cur["habits"].append(ev["habitude"])
        if item["key"] == "cancers":
            links["soins"] = {"determinant": "soins", "label": by_key["soins"]["label"], "level": "prévention secondaire",
                              "habits": ["Dépistage organisé"], "status": by_key["soins"]["status"], "source": "dépistage"}
        out.append({"key": item["key"], "label": item["label"], "prev": item["prev"], "prev_france": item["prev_france"],
                    "trend_pts": item["trend_pts"], "links": list(links.values())})
    return out


def similar(code: str, contexts: dict[str, dict[str, Any]], n: int = 3) -> list[str]:
    """Most similar tracked cities: same type first, then closest population and density (log)."""
    me = contexts[code]

    def lg(v: float | None) -> float | None:
        return math.log10(v) if v and v > 0 else None

    scored = []
    for other, c in contexts.items():
        if other == code or len(other) != len(code):
            continue
        same = me.get("type") and me.get("type") == c.get("type")
        dp = abs(lg(me.get("population")) - lg(c.get("population"))) if lg(me.get("population")) and lg(c.get("population")) else 1
        dd = abs(lg(me.get("density")) - lg(c.get("density"))) if lg(me.get("density")) and lg(c.get("density")) else 1
        scored.append(((0 if same else 2) + dp + 0.5 * dd, other))
    return [o for _, o in sorted(scored)[:n]]


def disease_prevalences(dept: str) -> dict[str, float]:
    try:
        items = diseases.city_diseases(dept, None)["items"]
    except Exception:  # noqa: BLE001 - network: the comparison stays usable without diseases
        return {}
    return {i["key"]: i["prev"] for i in items}

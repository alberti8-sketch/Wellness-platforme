"""Chronic diseases of a commune's department vs France (Assurance Maladie, cartographie des pathologies).

The CNAM publishes prevalences by department, not by commune: a commune is described by its department's
prevalence, and the number of people concerned in the commune is an estimate (prevalence × population).
All ages, both sexes. One request per department (all pathologies, all years), cached on disk.
"""

from __future__ import annotations

import json
import time
import urllib.parse
from pathlib import Path
from typing import Any

import external_data as ext

# key → (CNAM `top` code of the level-1 group, label, kind, keywords of the evidence base)
DISEASES: dict[str, tuple[str, str, str, tuple[str, ...]]] = {
    "cardio": ("MCV_CAT_CAT", "Maladies cardioneurovasculaires", "maladie", ("cardiovasc",)),
    "risque_vasculaire": ("TFC_CAT_EXC", "Hypertension, cholestérol (traitements du risque vasculaire)", "facteur de risque",
                          ("hypertension",)),
    "diabete": ("DIA_CAT_CAT", "Diabète", "maladie", ("diabète",)),
    "cancers": ("CAN_CAT_CAT", "Cancers", "maladie", ("cancer",)),
    "psy": ("PSY_CAT_CAT", "Maladies psychiatriques", "maladie", ("dépression",)),
    "respiratoire": ("RES_CAT_EXC", "Maladies respiratoires chroniques", "maladie", ("bpco",)),
    "neuro": ("NEU_CAT_CAT", "Maladies neurologiques", "maladie", ("démence", "cognitif")),
    "inflammatoire": ("IRV_CAT_CAT", "Maladies inflammatoires, rares ou VIH", "maladie", ()),
    "foie": ("MFP_CAT_EXC", "Maladies du foie ou du pancréas", "maladie", ()),
    "rein": ("IRT_CAT_CAT", "Insuffisance rénale chronique terminale", "maladie", ("rénale",)),
}
NATIONAL = ("999", "99")  # France entière in the CNAM file (department 999, region 99)
CACHE_SECONDS = 30 * 24 * 3600
EVIDENCE_FILE = Path(__file__).resolve().parents[1] / "data" / "evidence" / "preuves.json"


def fetch_department(dept: str, region: str | None = None) -> list[dict[str, Any]]:
    """All years of all the DISEASES for one department (network)."""
    tops = ",".join(f"'{t[0]}'" for t in DISEASES.values())
    where = f"dept='{dept}' and top in ({tops}) and cla_age_5='tsage' and sexe=9"
    if region:
        where += f" and region='{region}'"
    q = urllib.parse.urlencode({"where": where, "select": "annee,top,prev,ntop", "limit": 100, "order_by": "annee"})
    rows = ext._get_json(f"{ext.AMELI_URL}?{q}").get("results", [])
    return [{"year": int(str(r["annee"])[:4]), "top": r["top"], "prev": r.get("prev"), "ntop": r.get("ntop")} for r in rows]


def _series(dept: str, region: str | None = None) -> list[dict[str, Any]]:
    name = f"maladies_{dept}_{region or 'x'}"
    hit = ext._cache_read(name)
    if hit and time.time() - hit[1] < CACHE_SECONDS:
        return hit[0]
    rows = fetch_department(dept, region)
    if rows:
        ext._cache_write(name, rows)
    return rows


def _by_top(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        if r["prev"] is not None:
            out.setdefault(r["top"], []).append(r)
    for v in out.values():
        v.sort(key=lambda r: r["year"])
    return out


def evidence() -> dict[str, Any]:
    if not EVIDENCE_FILE.exists():
        return {"liens": [], "injep": [], "sources": {}}
    return json.loads(EVIDENCE_FILE.read_text(encoding="utf-8"))


def evidence_for(key: str) -> list[dict[str, str]]:
    words = DISEASES[key][3]
    return [link for link in evidence()["liens"] if any(w in link["maladie"].lower() for w in words)]


def city_diseases(dept: str, population: float | None) -> dict[str, Any]:
    """Prevalence of each disease in the department vs France, trend since the first year, people concerned."""
    local, france = _by_top(_series(dept)), _by_top(_series(*NATIONAL))
    items = []
    for key, (top, label, kind, _) in DISEASES.items():
        s, fr = local.get(top), france.get(top)
        if not s:
            continue
        last, first = s[-1], s[0]
        fr_last = next((r for r in reversed(fr or []) if r["year"] == last["year"]), None)
        prev, prev_fr = float(last["prev"]), float(fr_last["prev"]) if fr_last else None
        items.append({
            "key": key, "label": label, "kind": kind, "year": last["year"],
            "prev": round(prev, 2),
            "prev_france": round(prev_fr, 2) if prev_fr is not None else None,
            "ratio_france": round(prev / prev_fr, 2) if prev_fr else None,
            "trend_from_year": first["year"], "trend_from": round(float(first["prev"]), 2),
            "trend_pts": round(prev - float(first["prev"]), 2),
            "people_department": last["ntop"],
            "people_commune_est": round(prev / 100 * population / 10) * 10 if population else None,
            "evidence": evidence_for(key),
        })
    # Most over-represented first (vs France), then the most frequent.
    items.sort(key=lambda d: (-(d["ratio_france"] or 0), -d["prev"]))
    return {"departement": dept, "source": "Assurance Maladie, cartographie des pathologies (data.ameli.fr), tous âges, deux sexes",
            "items": items}

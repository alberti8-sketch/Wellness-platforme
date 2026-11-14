"""Build the training dataset of the disease decision tree (96 metropolitan departments).

Usage (from backend/):  python -m scripts.build_ml_dataset [--year 2024]

One row per department:
  target   prev_<patho>      prevalence (%), all ages, both sexes — Assurance Maladie, data.ameli.fr (effectifs)
  features pct_65plus        share of people aged 65+ (same source: insured population by age band)
           density_km2       inhabitants per km² — geo.api.gouv.fr (communes aggregated)
           fastfood_per10k   active fast-food businesses (NAF 56.10C « restauration de type rapide ») per 10,000
                             inhab. — base SIRENE via l'API Recherche d'entreprises (api.gouv.fr)
           poverty_rate      poverty rate 2021 (%) — INSEE, team file « INSEE RPC_PAUVRETÉ.xlsx »
                             (Drive DATA & PONDERATION; put it in data/sources/INSEE_RPC_PAUVRETE.xlsx)
           vet_per10k        active veterinary practices (NAF 75.00Z) per 10,000 inhab. — SIRENE
                             (« One Health » proxy of animal presence)
           sport_per10k      sport facilities per 10,000 inhab. — Recensement des équipements sportifs
                             (ministère des Sports, data-es)

Map-only column (not a tree feature):
           framingham_10y    estimated 10-year cardiovascular risk of the 40–74 year-olds (%), Framingham
                             office-based model averaged over the department population (see framingham.py)

Official, nationally homogeneous sources (OpenStreetMap is kept for the map layer only: its coverage
varies between places and whole-department Overpass queries are too slow).
Marseille, Paris and Lyon are recorded by arrondissement in both sources and are summed.

Also builds the same features for the WP25 communes (prediction inputs). Commune-level values are used
where they exist (density, fast food, sport); the age structure only exists per department and is
inherited from the commune's department (flagged in the output).

Outputs (versioned, small): data/ml/departements_<year>.csv and data/ml/communes_<year>.csv
API answers are cached under backend/data/cache/ml_sources/ so the script can resume.
"""

from __future__ import annotations

import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

from openpyxl import load_workbook
from pathlib import Path

from config import departements
from framingham import BANDS as FRAMINGHAM_BANDS
from framingham import population_risk

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "ml"
CACHE = Path(__file__).resolve().parents[1] / "data" / "cache" / "ml_sources"
UA = {"User-Agent": "wellness-platform/0.1 (decision-tree dataset)"}
AMELI = "https://data.ameli.fr/api/explore/v2.1/catalog/datasets/effectifs/exports/json"
SIRENE = "https://recherche-entreprises.api.gouv.fr/search"
DATA_ES = "https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json"
POVERTY_FILE = ROOT / "data" / "sources" / "INSEE_RPC_PAUVRETE.xlsx"
ARRONDISSEMENTS = {
    "13055": [f"132{i:02d}" for i in range(1, 17)],  # Marseille
    "75056": [f"751{i:02d}" for i in range(1, 21)],  # Paris
    "69123": [f"6938{i}" for i in range(1, 10)],  # Lyon
}

PATHOS = {  # level-1 aggregates of the CNAM cartography
    "diabete": "DIA_CAT_CAT",
    "cardio": "MCV_CAT_CAT",
    "respiratoire": "RES_CAT_EXC",
    "cancers": "CAN_CAT_CAT",
}
OLD_BANDS = {"65-69", "70-74", "75-79", "80-84", "85-89", "90-94", "95et+"}
WP25_COMMUNES = ["74010", "35238", "44109", "29019", "25056", "93048", "06088", "13055",
                 "78646", "46042", "17300", "66124", "63236", "13102"]


def get_json(url: str, data: bytes | None = None, timeout: int = 180):
    req = urllib.request.Request(url, data=data, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - fixed https hosts
        return json.load(r)


def ameli(where: str, select: str) -> list[dict]:
    q = urllib.parse.urlencode({"where": where, "select": select})
    return get_json(f"{AMELI}?{q}")


def metro(code: str) -> bool:
    return len(code) == 2  # 01–95, 2A, 2B (DOM codes are 3 chars)


def _cached(key: str, load):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text())
    value = load()
    f.write_text(json.dumps(value))
    return value


def sirene_count(naf: str, *, departement: str | None = None, commune: str | None = None) -> int:
    """Active businesses with the given NAF code having an establishment in the area (SIRENE)."""
    if commune in ARRONDISSEMENTS:
        return sum(sirene_count(naf, commune=c) for c in ARRONDISSEMENTS[commune])
    key = f"sirene_{naf.replace('.', '')}_{'d' + departement if departement else 'c' + str(commune)}"

    def load() -> int:
        params = {"activite_principale": naf, "etat_administratif": "A", "per_page": 1}
        params["departement" if departement else "code_commune"] = departement or commune
        for attempt in range(5):
            try:
                n = int(get_json(f"{SIRENE}?{urllib.parse.urlencode(params)}", timeout=60)["total_results"])
                time.sleep(0.25)  # API limit: 7 requests / second
                return n
            except Exception as exc:  # noqa: BLE001
                print(f"  SIRENE {key}: {exc} — nouvel essai", flush=True)
                time.sleep(3 * (attempt + 1))
        raise RuntimeError(f"SIRENE indisponible pour {key}")

    return _cached(key, load)


def poverty_by_departement() -> dict[str, float]:
    """INSEE poverty rate by department (sheet « Territoire - Figure 1 »)."""
    if not POVERTY_FILE.exists():
        raise SystemExit(f"Fichier INSEE absent : {POVERTY_FILE} (Drive DATA & PONDERATION / INSEE RPC_PAUVRETÉ.xlsx)")
    ws = load_workbook(POVERTY_FILE, read_only=True, data_only=True)["Territoire - Figure 1"]
    out = {}
    for row in ws.iter_rows(values_only=True):
        code, _name, rate = (list(row) + [None, None, None])[:3]
        if isinstance(code, str) and isinstance(rate, (int, float)) and len(code.strip()) in (2, 3):
            out[code.strip()] = float(rate)
    return out


def fastfood_count(*, departement: str | None = None, commune: str | None = None) -> int:
    return sirene_count("56.10C", departement=departement, commune=commune)


def vet_count(*, departement: str | None = None, commune: str | None = None) -> int:
    return sirene_count("75.00Z", departement=departement, commune=commune)


def framingham_by_departement(year: int, depts: dict[str, str]) -> dict[str, float | None]:
    """Population-averaged Framingham risk (40–74 y) from age-sex bands, diabetes and BP treatment."""
    bands = ",".join(f'"{b}"' for b in FRAMINGHAM_BANDS)
    rows = ameli(
        f"annee=date'{year}' and sexe in (\"1\",\"2\") and cla_age_5 in ({bands}) and top in (\"DIA_CAT_CAT\",\"TFC_HTA_EXC\")",
        "dept,sexe,cla_age_5,top,prev,npop",
    )
    cells: dict[str, dict[tuple[str, str], list[float]]] = defaultdict(dict)
    for r in rows:
        if r["dept"] not in depts:
            continue
        k = ("M" if str(r["sexe"]) == "1" else "F", r["cla_age_5"])
        cell = cells[r["dept"]].setdefault(k, [r["npop"], 0.0, 0.0])
        cell[1 if r["top"] == "DIA_CAT_CAT" else 2] = r["prev"]
    return {code: population_risk({k: tuple(v) for k, v in c.items()}) for code, c in cells.items()}


def sport_counts_by_departement() -> dict[str, int]:
    def load() -> dict[str, int]:
        q = urllib.parse.urlencode({"select": "dep_code_filled,count(*) as n", "group_by": "dep_code_filled"})
        return {r["dep_code_filled"]: int(r["n"]) for r in get_json(f"{DATA_ES}?{q}") if r.get("dep_code_filled")}

    return _cached("data_es_departements", load)


def sport_count_commune(code: str) -> int:
    codes = ARRONDISSEMENTS.get(code, [code])

    def load() -> int:
        where = "new_code in (" + ",".join(f'"{c}"' for c in codes) + ")"
        q = urllib.parse.urlencode({"select": "count(*) as n", "where": where})
        res = get_json(f"{DATA_ES}?{q}")
        return int(res[0]["n"]) if res else 0

    return _cached(f"data_es_commune_{code}", load)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    year = int(sys.argv[sys.argv.index("--year") + 1]) if "--year" in sys.argv else 2024
    depts = {c: n for c, n in departements().items() if metro(c)}
    print(f"{len(depts)} départements, année {year}", flush=True)

    # 1. Targets: prevalence per department and pathology.
    tops = ",".join(f'"{t}"' for t in PATHOS.values())
    rows = ameli(f"annee=date'{year}' and sexe=9 and cla_age_5=\"tsage\" and top in ({tops})", "dept,top,prev,npop")
    prev: dict[str, dict[str, float]] = defaultdict(dict)
    pop: dict[str, float] = {}
    for r in rows:
        if r["dept"] not in depts:  # skip regional / national aggregates (dept "999") and DOM
            continue
        key = next(k for k, v in PATHOS.items() if v == r["top"])
        prev[r["dept"]][key] = r["prev"]
        pop[r["dept"]] = r["npop"]
    print(f"Prévalences : {len(prev)} départements", flush=True)

    # 2. Age structure (insured population by age band).
    ages = ameli(f"annee=date'{year}' and sexe=9 and top=\"{PATHOS['diabete']}\"", "dept,cla_age_5,npop")
    old: dict[str, float] = defaultdict(float)
    for r in ages:
        if r["dept"] in depts and r["cla_age_5"] in OLD_BANDS:
            old[r["dept"]] += r["npop"]

    # 3. Density from communes (population, surface in hectares).
    communes = get_json("https://geo.api.gouv.fr/communes?fields=code,population,surface,codeDepartement&format=json")
    dpop: dict[str, float] = defaultdict(float)
    dsurf: dict[str, float] = defaultdict(float)
    cinfo: dict[str, dict] = {}
    for c in communes:
        if c.get("population") and c.get("surface"):
            dpop[c["codeDepartement"]] += c["population"]
            dsurf[c["codeDepartement"]] += c["surface"] / 100  # ha -> km²
            cinfo[c["code"]] = c

    # 4. Fast food (SIRENE, one call per department) and sport facilities (data-es, one call).
    OUT.mkdir(parents=True, exist_ok=True)
    sport = sport_counts_by_departement()
    poverty = poverty_by_departement()
    framingham = framingham_by_departement(year, depts)
    out_rows = []
    for i, (code, name) in enumerate(sorted(depts.items()), 1):
        counts = {"fast_food": fastfood_count(departement=code), "sport": sport.get(code, 0), "vet": vet_count(departement=code)}
        p = dpop[code]
        out_rows.append({
            "dept": code, "name": name, "population": int(p),
            "pct_65plus": round(100 * old[code] / pop[code], 2) if pop.get(code) else "",
            "density_km2": round(p / dsurf[code], 1) if dsurf[code] else "",
            "poverty_rate": poverty.get(code, ""),
            "fastfood_per10k": round(10_000 * counts["fast_food"] / p, 2) if p else "",
            "sport_per10k": round(10_000 * counts["sport"] / p, 2) if p else "",
            "vet_per10k": round(10_000 * counts["vet"] / p, 2) if p else "",
            "framingham_10y": framingham.get(code) or "",
            **{f"prev_{k}": prev[code].get(k, "") for k in PATHOS},
        })
        print(f"[{i}/{len(depts)}] {code} {name}: {counts}", flush=True)
    # Sanity check of the territorial Framingham estimate against observed cardio prevalence.
    pairs = [(r["framingham_10y"], r["prev_cardio"]) for r in out_rows if r["framingham_10y"] != "" and r["prev_cardio"] != ""]
    if len(pairs) > 2:
        xs, ys = zip(*pairs, strict=True)
        mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
        cov = sum((x - mx) * (y - my) for x, y in pairs)
        r = cov / ((sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys)) ** 0.5)
        print(f"Corrélation Framingham estimé × prévalence cardio observée : r = {r:.2f} ({len(pairs)} départements)", flush=True)
    path = OUT / f"departements_{year}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0]))
        w.writeheader()
        w.writerows(out_rows)
    print(f"→ {path}", flush=True)

    # 5. Prediction inputs for the WP25 communes.
    by_dept = {r["dept"]: r for r in out_rows}
    crow = []
    for code in WP25_COMMUNES:
        info = cinfo[code]
        d = by_dept[info["codeDepartement"]]
        counts = {"fast_food": fastfood_count(commune=code), "sport": sport_count_commune(code), "vet": vet_count(commune=code)}
        p = info["population"]
        crow.append({
            "code": code, "dept": info["codeDepartement"], "population": p,
            "pct_65plus": d["pct_65plus"], "pct_65plus_level": "departement",
            "density_km2": round(p / (info["surface"] / 100), 1),
            "poverty_rate": d["poverty_rate"], "poverty_rate_level": "departement",
            "fastfood_per10k": round(10_000 * counts["fast_food"] / p, 2),
            "sport_per10k": round(10_000 * counts["sport"] / p, 2),
            "vet_per10k": round(10_000 * counts["vet"] / p, 2),
            "framingham_10y": d["framingham_10y"], "framingham_10y_level": "departement",
        })
        print(f"commune {code}: {counts}", flush=True)
    path = OUT / f"communes_{year}.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(crow[0]))
        w.writeheader()
        w.writerows(crow)
    print(f"→ {path}", flush=True)


if __name__ == "__main__":
    main()

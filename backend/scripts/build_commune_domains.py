"""Build the commune-level « domain map » dataset (all French communes of 2,000 inhabitants or more).

Output: data/ml/communes_domaines_2024.csv — one row per commune, one column per indicator:

  Marche        walk_class, walk_score (/20), walk_safety, walk_comfort, walk_effort, walk_services
                — Baromètre des villes marchables 2023 (Place aux piétons; 236 communes with enough answers)
  Vélo          bike_share (% of the road network with a cycling facility), bike_parking_1000
                — Vélo & Territoires 2024, cyclabilité et stationnement par commune
  Alimentation  fastfood_10k (NAF 56.10C), restaurant_10k (NAF 56.10A) — SIRENE, active establishments
  Sport         sport_10k — Recensement des équipements sportifs (data-es); sport_rate_size: INJEP 2023
                national practice rate for the commune's urban-area size (context, not a commune survey)
  Santé         gp_10k (NAF 86.21Z, general practice) — SIRENE

Sources not versioned (data/sources/, git-ignored):
  barometre_villes_marchables_2023.xlsx, VT_2024_cyclabilite_stationnement_commune.csv
Run from backend/:  python -m scripts.build_commune_domains
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd

from commune_domains import SPORT_RATE_2023

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "data" / "sources"
CACHE = Path(__file__).resolve().parents[1] / "data" / "cache" / "commune_domains"
OUT = ROOT / "data" / "ml" / "communes_domaines_2024.csv"
OUT_DEPT = ROOT / "data" / "ml" / "departements_mobilite_2024.csv"
WALK_FILE = SOURCES / "barometre_villes_marchables_2023.xlsx"
BIKE_FILE = SOURCES / "VT_2024_cyclabilite_stationnement_commune.csv"
FOOD_FILE = SOURCES / "score_communal_alimentation.xlsx"  # Score_communal_alimentation_final.xlsx (team)
# SDES, Corine Land Cover par commune, 15 postes (statistiques.developpement-durable.gouv.fr, clc_etat_com_n2.csv)
LAND_FILE = SOURCES / "clc_occupation_sol_communes.csv"
# OpenStreetMap green spaces of the tracked cities (python -m scripts.build_osm_green), versioned
OSM_FILE = ROOT / "data" / "ml" / "communes_osm_2024.csv"
# The tracked cities are always kept, even under MIN_POP (Font-Romeu, Le Mont-Dore).
TRACKED = {"74010", "35238", "44109", "29019", "25056", "93048", "06088", "13055",
           "78646", "46042", "17300", "66124", "63236", "13102"}
MIN_POP = 2000

UA = {"User-Agent": "wellness-platform/0.1 (commune dataset)"}
SIRENE_ODS = "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/economicref-france-sirene-v3/exports/json"
DATA_ES = "https://equipements.sports.gouv.fr/api/explore/v2.1/catalog/datasets/data-es/exports/json"
GEO = "https://geo.api.gouv.fr/communes?fields=code,nom,centre,population,surface,codeDepartement&format=json"



def get_json(url: str, timeout: int = 300):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - fixed https hosts
        return json.load(r)


def cached(key: str, load):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{key}.json"
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    value = load()
    f.write_text(json.dumps(value), encoding="utf-8")
    return value


def commune_of(code: str) -> str:
    """Paris / Lyon / Marseille arrondissement codes → commune code."""
    if code.startswith("751") and len(code) == 5 and code != "75056":
        return "75056"
    if code.startswith("132") and code[3:].isdigit() and 1 <= int(code[3:]) <= 16:
        return "13055"
    if code.startswith("6938") and code != "69123":
        return "69123"
    return code


def sirene_by_commune(naf: str) -> dict[str, int]:
    def load() -> dict[str, int]:
        q = urllib.parse.urlencode({
            "select": "codecommuneetablissement as code, count(*) as n",
            "where": f'activiteprincipaleetablissement="{naf}" and etatadministratifetablissement="Actif"',
            "group_by": "codecommuneetablissement",
        })
        out: dict[str, int] = {}
        for r in get_json(f"{SIRENE_ODS}?{q}"):
            if r["code"]:
                c = commune_of(r["code"])
                out[c] = out.get(c, 0) + int(r["n"])
        return out

    return cached(f"sirene_{naf.replace('.', '')}", load)


def sport_by_commune() -> dict[str, int]:
    def load() -> dict[str, int]:
        q = urllib.parse.urlencode({"select": "new_code as code, count(*) as n", "group_by": "new_code"})
        out: dict[str, int] = {}
        for r in get_json(f"{DATA_ES}?{q}"):
            if r["code"]:
                c = commune_of(r["code"])
                out[c] = out.get(c, 0) + int(r["n"])
        return out

    return cached("data_es_communes", load)


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).replace("saint ", "st ").replace("sainte ", "ste ").strip()


def walk_by_commune(geo: list[dict], dept_names: dict[str, str]) -> dict[str, dict]:
    df = pd.read_excel(WALK_FILE, sheet_name="Liste des communes 2023")
    df.columns = ["name", "dept", "region", "size", "cls", "feeling", "safety", "comfort", "effort", "services", "score", "declared"]
    by_name_dept = {(norm(c["nom"]), c["codeDepartement"]): c["code"] for c in geo}
    dept_code = {norm(n): c for c, n in dept_names.items()}
    out: dict[str, dict] = {}
    missing = []
    for r in df.itertuples():
        dc = dept_code.get(norm(r.dept))
        code = by_name_dept.get((norm(r.name), dc))
        if not code:
            missing.append(f"{r.name} ({r.dept})")
            continue
        out[code] = {
            "walk_class": str(r.cls).strip(),
            "walk_score": round(float(r.score), 2),
            "walk_safety": round(float(r.safety), 2),
            "walk_comfort": round(float(r.comfort), 2),
            "walk_effort": round(float(r.effort), 2),
            "walk_services": round(float(r.services), 2),
        }
    print(f"Marche : {len(out)} communes appariées, {len(missing)} non trouvées {missing[:10]}")
    return out


def food_by_commune() -> dict[str, dict]:
    """Team food-environment score (0-100, BPE 2025 + SIRENE, mRFEI-like method) — optional source."""
    if not FOOD_FILE.exists():
        print(f"Alimentation : {FOOD_FILE.name} absent, score non intégré")
        return {}
    df = pd.read_excel(FOOD_FILE, sheet_name="Toutes les communes", dtype={"Code INSEE": str})
    out: dict[str, dict] = {}
    for r in df.itertuples(index=False):
        code = str(r[0]).zfill(5)
        out[code] = {
            "food_score": round(float(r[23]), 1),
            "food_balance": round(float(r[16]), 1),
            "fresh_10k": round(float(r[17]), 2),
            "fastfood_10k": round(float(r[19]), 2),  # SIRENE 56.10C, employers or with a sign
            "food_type": str(r[24]),
            "food_reliable": 1 if str(r[25]).startswith("bonne") else 0,
        }
    print(f"Alimentation : {len(out)} communes")
    return out


def land_by_commune() -> dict[str, dict]:
    """Land cover 2018 (Corine Land Cover, SDES): % of the commune's area by type. Optional source.

    CLC maps patches of 25 ha or more: small parks and gardens inside built-up areas are not counted.
    """
    if not LAND_FILE.exists():
        print(f"Occupation du sol : {LAND_FILE.name} absent, non intégré")
        return {}
    df = pd.read_csv(LAND_FILE, sep=";", dtype=str, encoding="utf-8")
    df = df[df.iloc[:, 1] == "2018"]
    out: dict[str, dict] = {}
    for r in df.itertuples(index=False):
        ha = [float(x or 0) for x in r[3:18]]  # postes 11, 12, 13, 14, 21-24, 31-33, 41, 42, 51, 52
        total = sum(ha)
        if total <= 0:
            continue
        pct = lambda *idx: round(100 * sum(ha[i] for i in idx) / total, 1)  # noqa: E731
        out[str(r[0]).zfill(5)] = {
            "land_built_pct": pct(0, 1, 2),        # built-up, business zones and transport, mines and building sites
            "land_green_pct": pct(3),             # urban green spaces (parks, sports and leisure grounds)
            "land_agri_pct": pct(4, 5, 6, 7),
            "land_natural_pct": pct(8, 9, 10),    # forests and semi-natural areas
            "land_water_pct": pct(11, 12, 13, 14),
        }
    print(f"Occupation du sol : {len(out)} communes")
    return out


def bike_by_commune() -> tuple[dict[str, dict], dict[str, str]]:
    v = pd.read_csv(BIKE_FILE, dtype={"INSEE_COM": str, "INSEE_EPCI": str, "INSEE_DEP": str}, encoding="utf-8-sig")
    out: dict[str, dict] = {}
    size: dict[str, str] = {}
    for r in v.itertuples(index=False):
        code = r.INSEE_COM
        road = float(r.Voirie_reference_km or 0)
        share = 100 * float(r.Amenagement_cyclable_km or 0) / road if road > 0 else None
        out[code] = {
            "bike_share": round(min(share, 100), 2) if share is not None else None,
            "bike_parking_1000": round(float(r.Stationnement_1000hab), 2) if pd.notna(r.Stationnement_1000hab) else None,
            "zone30_share": round(min(100 * float(r.Zone_30_km or 0) / road, 100), 2) if road > 0 else None,
            "pedestrian_share": round(min(100 * float(r.Zone_pietonne_km or 0) / road, 100), 2) if road > 0 else None,
        }
        t = r.UU_taille if isinstance(r.UU_taille, str) else ""
        if t == "Paris":
            size[code] = "paris"
        elif not t:
            size[code] = "rural"
        elif t.startswith(("2 000", "5 000", "10 000")):
            size[code] = "2k-20k"
        elif t.startswith(("20 000", "50 000")):
            size[code] = "20k-100k"
        else:
            size[code] = "100k+"
    print(f"Vélo : {len(out)} communes")
    return out, size


def mobility_by_departement(walk: dict[str, dict], geo: list[dict]) -> pd.DataFrame:
    """Department aggregates of the walking and cycling studies (for the diabetes statistics).

    Cycling: all communes (km with a cycling facility / km of roads; parking spaces per 1,000 inhabitants).
    Walking: population-weighted mean of the communes rated by the barometer (missing when none).
    """
    v = pd.read_csv(BIKE_FILE, dtype={"INSEE_COM": str, "INSEE_DEP": str, "INSEE_EPCI": str}, encoding="utf-8-sig")
    g = v.groupby("INSEE_DEP").agg(road=("Voirie_reference_km", "sum"), bike=("Amenagement_cyclable_km", "sum"),
                                   park=("Stationnement", "sum"), people=("Pop", "sum"))
    out = pd.DataFrame({"bike_share": (100 * g.bike / g.road).round(2), "bike_parking_1000": (1000 * g.park / g.people).round(2)})
    pop = {c["code"]: c.get("population") or 0 for c in geo}
    w = pd.DataFrame([{"dept": (code[:3] if code.startswith("97") else code[:2]), "score": r["walk_score"], "pop": pop.get(code, 0)}
                      for code, r in walk.items()])
    agg = w.groupby("dept").apply(lambda d: pd.Series({
        "walk_score": round(float((d.score * d["pop"]).sum() / d["pop"].sum()), 2) if d["pop"].sum() else None,
        "walk_communes": len(d),
    }), include_groups=False)
    out = out.join(agg, how="left")
    out["walk_communes"] = out["walk_communes"].fillna(0).astype(int)
    out.index.name = "dept"
    return out[out.index.str.len() == 2].reset_index()


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for f in (WALK_FILE, BIKE_FILE):
        if not f.exists():
            raise SystemExit(f"Fichier source manquant : {f} (voir le Drive de l'équipe)")
    dept_names = json.loads((Path(__file__).resolve().parents[1] / "data" / "departements.json").read_text(encoding="utf-8"))
    geo = cached("geo_communes", lambda: get_json(GEO))
    walk = walk_by_commune(geo, dept_names)
    bike, size = bike_by_commune()
    food = food_by_commune()
    land = land_by_commune()
    osm = pd.read_csv(OSM_FILE, dtype={"code": str}).set_index("code").to_dict("index") if OSM_FILE.exists() else {}
    fast, resto, gp = sirene_by_commune("56.10C"), sirene_by_commune("56.10A"), sirene_by_commune("86.21Z")
    sport = sport_by_commune()
    print(f"SIRENE : {sum(fast.values())} fast-foods, {sum(resto.values())} restaurants, {sum(gp.values())} cabinets de médecine générale")
    print(f"Équipements sportifs : {sum(sport.values())}")

    def per10k(n: int | None, pop: int) -> float | None:
        return round(10000 * n / pop, 2) if pop and n is not None else None

    rows = []
    for c in geo:
        code, pop = c["code"], c.get("population") or 0
        if pop < MIN_POP and code not in walk and code not in TRACKED:
            continue
        if len(c["codeDepartement"]) != 2 or not c.get("centre"):
            continue  # metropolitan France (the map frame)
        lon, lat = c["centre"]["coordinates"]
        sz = size.get(code, "rural")
        rows.append({
            "code": code,
            "name": c["nom"],
            "dep": c["codeDepartement"],
            "population": pop,
            "density_km2": round(pop / (c["surface"] / 100), 1) if c.get("surface") else None,
            "lat": round(lat, 5),
            "lon": round(lon, 5),
            **walk.get(code, {}),
            **bike.get(code, {}),
            **food.get(code, {}),
            **land.get(code, {}),
            **osm.get(code, {}),
            "fastfood_10k": food.get(code, {}).get("fastfood_10k", per10k(fast.get(code, 0), pop)),
            "restaurant_10k": per10k(resto.get(code, 0), pop),
            "sport_10k": per10k(sport.get(code, 0), pop),
            "gp_10k": per10k(gp.get(code, 0), pop),
            "size_class": sz,
            "sport_rate_size": SPORT_RATE_2023[sz]["rate"],
        })
    df = pd.DataFrame(rows).sort_values("code")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUT, index=False, encoding="utf-8")
    print(f"{len(df)} communes → {OUT.relative_to(ROOT)}")
    mob = mobility_by_departement(walk, geo)
    mob.to_csv(OUT_DEPT, index=False, encoding="utf-8")
    print(f"{len(mob)} départements → {OUT_DEPT.relative_to(ROOT)}")
    print(df.describe().T[["mean", "50%", "max"]].round(2))


if __name__ == "__main__":
    main()

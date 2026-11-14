"""External public context data, cached on disk.

* Pathology trends — Assurance Maladie open data (data.ameli.fr, dataset « effectifs »):
  yearly prevalence 2015→latest per DEPARTMENT, all ages (`cla_age_5='tsage'`), both sexes
  (`sexe=9`). Level-1 aggregates are selected by their `top` code. Obesity is NOT part of the
  Assurance Maladie pathology mapping: it is reported as unavailable, never estimated.
* Food environment — OpenStreetMap via the Overpass API: fast-food / snack outlets
  (amenity=fast_food + food_court), restaurants and cafés inside a COMMUNE boundary
  (ref:INSEE, admin_level 8). Population from geo.api.gouv.fr for the density per 10k.

All outbound calls go through the three `fetch_*` functions (monkeypatched in tests), only
after the territory code has been validated against the official INSEE reference.
Network failures never raise: the last cached value is served, else an `error` field.
"""

from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from config import BASE_DIR
from geo import territory_level, territory_name

USER_AGENT = "wellness-platform/0.1 (prototype santé publique; contact via dépôt GitHub)"
AMELI_URL = "https://data.ameli.fr/api/explore/v2.1/catalog/datasets/effectifs/records"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
GEO_API_COMMUNE = "https://geo.api.gouv.fr/communes/{code}"

TRENDS_TTL = 30 * 24 * 3600  # yearly data: refresh monthly at most
FOOD_TTL = 7 * 24 * 3600
MAX_TERRITORIES = 30
MAX_POINTS = 1500

PATHOLOGIES: dict[str, tuple[str, str]] = {
    # key: (ameli `top` code of the level-1 aggregate, French label)
    "diabete": ("DIA_CAT_CAT", "Diabète"),
}

OBESITY_NOTE = (
    "L'obésité ne fait pas partie de la cartographie des pathologies de l'Assurance Maladie : aucune série "
    "annuelle par département n'est disponible ici. Le diabète (fortement lié à l'obésité) et la densité de "
    "restauration rapide servent d'indicateurs indirects."
)

_overpass_lock = threading.Lock()  # one Overpass request at a time (usage policy)
_cache_lock = threading.Lock()


# --------------------------------------------------------------------------- #
# Disk cache                                                                  #
# --------------------------------------------------------------------------- #
def cache_dir() -> Path:
    path = Path(os.getenv("WELLNESS_CACHE_DIR", str(BASE_DIR / "data" / "cache")))
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_read(name: str) -> tuple[Any, float] | None:
    f = cache_dir() / f"{name}.json"
    if not f.exists():
        return None
    try:
        payload = json.loads(f.read_text(encoding="utf-8"))
        return payload["data"], float(payload["stored_at"])
    except (OSError, ValueError, KeyError):
        return None


def _cache_write(name: str, data: Any) -> None:
    with _cache_lock:
        (cache_dir() / f"{name}.json").write_text(
            json.dumps({"stored_at": time.time(), "data": data}, ensure_ascii=False), encoding="utf-8"
        )


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Network (the only functions doing I/O — monkeypatched in tests)             #
# --------------------------------------------------------------------------- #
def _get_json(url: str, timeout: float = 30) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https hosts
        return json.load(resp)


def fetch_ameli_series(dept: str, top: str) -> list[dict[str, Any]]:
    where = f"dept='{dept}' and top='{top}' and cla_age_5='tsage' and sexe=9"
    q = urllib.parse.urlencode({"where": where, "select": "annee,prev,ntop,npop", "order_by": "annee", "limit": 50})
    rows = _get_json(f"{AMELI_URL}?{q}").get("results", [])
    return [
        {"year": int(str(r["annee"])[:4]), "prev": r.get("prev"), "ntop": r.get("ntop"), "npop": r.get("npop")}
        for r in rows
    ]


def fetch_overpass(code: str) -> list[dict[str, Any]]:
    query = f"""[out:json][timeout:60];
area["ref:INSEE"="{code}"]["boundary"="administrative"]["admin_level"="8"]->.a;
(nwr["amenity"="fast_food"](area.a);nwr["amenity"="food_court"](area.a);)->.ff;
nwr["amenity"="restaurant"](area.a)->.re;
nwr["amenity"="cafe"](area.a)->.ca;
.ff out center tags;
.re out count;
.ca out count;"""
    data = urllib.parse.urlencode({"data": query}).encode()
    with _overpass_lock:
        for attempt in range(3):
            req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=90) as resp:  # noqa: S310 - fixed https host
                    payload = json.load(resp)
                break
            except urllib.error.HTTPError as exc:
                # 429 = rate limited, 502/503/504 = server busy: back off and retry (Overpass usage policy).
                if exc.code not in (429, 502, 503, 504) or attempt == 2:
                    raise
                time.sleep(15 * (attempt + 1))
        time.sleep(1)  # be polite between consecutive requests
    return payload.get("elements", [])


def fetch_population(code: str) -> tuple[str | None, int | None]:
    data = _get_json(GEO_API_COMMUNE.format(code=code) + "?fields=nom,population", timeout=15)
    return data.get("nom"), data.get("population")


# --------------------------------------------------------------------------- #
# Pathology trends                                                            #
# --------------------------------------------------------------------------- #
def department_of(code: str) -> str | None:
    level = territory_level(code)
    if level == "departement":
        return code
    if level == "commune":
        return code[:3] if code.startswith("97") else code[:2]
    return None


def _series_for(dept: str, key: str) -> dict[str, Any]:
    top = PATHOLOGIES[key][0]
    name = f"ameli_{key}_{dept}"
    cached = _cache_read(name)
    if cached and time.time() - cached[1] < TRENDS_TTL:
        return {"points": cached[0], "error": None}
    try:
        points = fetch_ameli_series(dept, top)
    except (OSError, ValueError) as exc:
        if cached:
            return {"points": cached[0], "error": None, "stale": True}
        return {"points": [], "error": f"data.ameli.fr indisponible ({exc.__class__.__name__})"}
    _cache_write(name, points)
    return {"points": points, "error": None}


def pathology_trends(codes: list[str], key: str) -> dict[str, Any]:
    series: dict[str, Any] = {}
    for code in codes[:MAX_TERRITORIES]:
        dept = department_of(code)
        if dept is None:
            series[code] = {"departement": None, "points": [], "error": "Code INSEE inconnu"}
            continue
        series[code] = {"departement": dept, **_series_for(dept, key)}
    return {
        "patho": key,
        "label": PATHOLOGIES[key][1],
        "source": "Assurance Maladie — data.ameli.fr (effectifs)",
        "level": "departement",
        "unit": "prévalence en % (tous âges, deux sexes)",
        "obesity_available": False,
        "note": OBESITY_NOTE,
        "series": series,
    }


# --------------------------------------------------------------------------- #
# Food environment                                                            #
# --------------------------------------------------------------------------- #
def _parse_overpass(elements: list[dict[str, Any]]) -> tuple[dict[str, int], list[dict[str, Any]]]:
    points: list[dict[str, Any]] = []
    counts_seen: list[int] = []
    for el in elements:
        if el.get("type") == "count":
            counts_seen.append(int(el.get("tags", {}).get("total", 0)))
            continue
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None or lon is None:
            continue
        tags = el.get("tags", {})
        points.append({
            "lat": round(float(lat), 6),
            "lon": round(float(lon), 6),
            "name": tags.get("name"),
            "kind": tags.get("amenity", "fast_food"),
            "cuisine": tags.get("cuisine"),
        })
    restaurant = counts_seen[0] if len(counts_seen) > 0 else 0
    cafe = counts_seen[1] if len(counts_seen) > 1 else 0
    return {"fast_food": len(points), "restaurant": restaurant, "cafe": cafe}, points


def _food_for(code: str) -> dict[str, Any]:
    name = f"osm_food_{code}"
    cached = _cache_read(name)
    if cached and time.time() - cached[1] < FOOD_TTL:
        entry = cached[0]
        if entry.get("population") is None and entry.get("counts"):
            # population lookup failed last time: retry it (cheap), keep the OSM counts
            try:
                nom, population = fetch_population(code)
            except (OSError, ValueError):
                population = None
            if population:
                entry = {**entry, "name": nom or entry.get("name"), "population": population,
                         "fast_food_per_10k": round(10_000 * entry["counts"]["fast_food"] / population, 2)}
                _cache_write(name, entry)
        return {**entry, "error": None}
    try:
        counts, points = _parse_overpass(fetch_overpass(code))
        try:
            nom, population = fetch_population(code)
        except (OSError, ValueError):
            nom, population = territory_name(code), None
        entry = {
            "name": nom or territory_name(code),
            "population": population,
            "counts": counts,
            "fast_food_per_10k": round(10_000 * counts["fast_food"] / population, 2) if population else None,
            "points": points[:MAX_POINTS],
            "fetched_at": _now_iso(),
        }
    except (OSError, ValueError) as exc:
        if cached:
            return {**cached[0], "error": None, "stale": True}
        return {"name": territory_name(code), "population": None, "counts": None, "fast_food_per_10k": None,
                "points": [], "fetched_at": None, "error": f"Overpass indisponible ({exc.__class__.__name__})"}
    _cache_write(name, entry)
    return {**entry, "error": None}


def food_environment(codes: list[str], include_points: bool) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for code in codes[:MAX_TERRITORIES]:
        if territory_level(code) != "commune":
            out[code] = {"name": territory_name(code), "population": None, "counts": None,
                         "fast_food_per_10k": None, "points": [], "fetched_at": None,
                         "error": "Code commune INSEE (5 caractères) attendu"}
            continue
        entry = _food_for(code)
        if not include_points:
            entry = {**entry, "points": []}
        out[code] = entry
    return {
        "source": "OpenStreetMap contributors (Overpass API), ODbL",
        "categories": {"fast_food": "Restauration rapide / snack (amenity=fast_food, food_court)",
                       "restaurant": "Restaurants (amenity=restaurant)", "cafe": "Cafés (amenity=cafe)"},
        "note": "Recensement collaboratif OpenStreetMap : exhaustivité variable selon les villes.",
        "fetched_at": _now_iso(),
        "territories": out,
    }

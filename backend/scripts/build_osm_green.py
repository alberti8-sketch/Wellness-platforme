"""Green spaces of the tracked cities from OpenStreetMap (complements Corine Land Cover, which ignores patches < 25 ha).

For each tracked commune: OSM parks, public gardens, nature reserves, recreation grounds, playgrounds, allotments,
grass, woods, meadows and scrub inside the commune boundary (geo.api.gouv.fr contour), merged (no double counting).
Output: data/ml/communes_osm_2024.csv — osm_green_pct (share of the commune area), osm_green_m2_hab (m² per inhabitant).
Run from backend/:  python -m scripts.build_osm_green   (Overpass API, ~1 min per large city; cached)
Licence: © OpenStreetMap contributors, ODbL.
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
from shapely.geometry import LineString, Polygon, shape
from shapely.ops import polygonize, transform, unary_union

from geo import commune_contours
from scripts.build_commune_domains import TRACKED

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "ml" / "communes_osm_2024.csv"
CACHE = Path(__file__).resolve().parents[1] / "data" / "cache" / "osm_green"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
UA = {"User-Agent": "wellness-platform/0.1 (green spaces of tracked communes)"}

GREEN = {
    "leisure": "park|garden|nature_reserve|recreation_ground|playground|dog_park",
    "landuse": "grass|village_green|recreation_ground|forest|meadow|allotments",
    "natural": "wood|scrub|grassland|heath",
}


def query(code: str, key: str) -> str:
    """One OSM key per request (parks / land use / natural): smaller answers for big cities."""
    values = GREEN[key]
    return (f'[out:json][timeout:240];area["ref:INSEE"="{code}"]["boundary"="administrative"]["admin_level"="8"]->.a;'
            f'(way["{key}"~"^({values})$"](area.a);relation["{key}"~"^({values})$"](area.a););out geom;')


def fetch(code: str) -> list[dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    elements: list[dict] = []
    for key in GREEN:
        f = CACHE / f"{code}_{key}.json"
        if f.exists():
            elements += json.loads(f.read_text(encoding="utf-8"))
            continue
        data = urllib.parse.urlencode({"data": query(code, key)}).encode()
        for attempt in range(6):
            url = OVERPASS[attempt % len(OVERPASS)]
            try:
                req = urllib.request.Request(url, data=data, headers=UA)
                with urllib.request.urlopen(req, timeout=300) as r:  # noqa: S310 - fixed https hosts
                    part = json.load(r)["elements"]
                f.write_text(json.dumps(part), encoding="utf-8")
                elements += part
                break
            except Exception as exc:  # noqa: BLE001 - Overpass is often busy: retry, alternate servers
                print(f"  Overpass {code}/{key} ({url.split('/')[2]}): {exc} — nouvel essai", flush=True)
                time.sleep(15 * (attempt + 1))
        else:
            raise RuntimeError(f"Overpass indisponible pour {code}/{key}")
        time.sleep(2)  # usage policy
    return elements


def private(tags: dict) -> bool:
    return tags.get("access") in ("private", "no") or (tags.get("leisure") == "garden" and tags.get("garden:type") == "residential")


def polygons(elements: list[dict]) -> list[Polygon]:
    out = []
    for e in elements:
        if private(e.get("tags", {})):
            continue
        if e["type"] == "way" and len(e.get("geometry", [])) >= 4:
            pts = [(p["lon"], p["lat"]) for p in e["geometry"]]
            if pts[0] == pts[-1]:
                poly = Polygon(pts).buffer(0)
                if not poly.is_empty:
                    out.append(poly)
        elif e["type"] == "relation":
            outer = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in e.get("members", [])
                     if m.get("role") == "outer" and len(m.get("geometry", [])) >= 2]
            inner = [LineString([(p["lon"], p["lat"]) for p in m["geometry"]]) for m in e.get("members", [])
                     if m.get("role") == "inner" and len(m.get("geometry", [])) >= 2]
            shell = unary_union(list(polygonize(outer)))
            if not shell.is_empty:
                holes = unary_union(list(polygonize(inner)))
                out.append(shell.difference(holes) if not holes.is_empty else shell)
    return out


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    contours = {f["properties"]["code"]: f for f in commune_contours(sorted(TRACKED))["features"]}
    geo = json.loads(urllib.request.urlopen(urllib.request.Request(  # noqa: S310 - fixed https host
        "https://geo.api.gouv.fr/communes?fields=code,population&format=json", headers=UA), timeout=120).read())
    pop = {c["code"]: c.get("population") for c in geo}
    rows = []
    for code in sorted(TRACKED):
        boundary = shape(contours[code]["geometry"]).buffer(0)
        lat0 = math.radians(boundary.centroid.y)
        # Local equirectangular projection in metres: precise enough at the scale of a commune.
        to_m = lambda x, y, z=None: (x * 111_320 * math.cos(lat0), y * 110_540)  # noqa: E731
        try:
            green = unary_union(polygons(fetch(code))).intersection(boundary)
        except RuntimeError as exc:
            print(f"{code} ignorée : {exc}", flush=True)
            continue
        area_c, area_g = transform(to_m, boundary).area, transform(to_m, green).area
        p = pop.get(code)
        rows.append({"code": code, "osm_green_pct": round(100 * area_g / area_c, 1),
                     "osm_green_m2_hab": round(area_g / p, 1) if p else None})
        print(f"{code} {contours[code]['properties']['nom']:28s} {rows[-1]['osm_green_pct']:5.1f} % · {rows[-1]['osm_green_m2_hab']} m²/hab", flush=True)
    pd.DataFrame(rows).to_csv(OUT, index=False, encoding="utf-8")
    print(f"{len(rows)} communes → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

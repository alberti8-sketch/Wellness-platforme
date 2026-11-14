"""Territory reference (départements + communes) and commune contours.

* Codes are validated against the official INSEE references in `data/`
  (départements: 2–3 chars, communes: 5 chars).
* Commune contours are served from a local cache (`data/geo_cache/communes.geojson`,
  committed for the demo communes). Missing contours are fetched once from the
  public API geo.api.gouv.fr — only after the code has been validated against
  the reference — and appended to the cache.
"""

from __future__ import annotations

import json
import threading
import urllib.parse
import urllib.request
from functools import lru_cache
from typing import Any, Literal

from config import BASE_DIR, departements

GEO_API = "https://geo.api.gouv.fr/communes"
CACHE_FILE = BASE_DIR / "data" / "geo_cache" / "communes.geojson"
_lock = threading.Lock()

Level = Literal["departement", "commune"]


@lru_cache
def communes() -> dict[str, str]:
    return json.loads((BASE_DIR / "data" / "communes.json").read_text(encoding="utf-8"))


def territory_level(code: str) -> Level | None:
    if len(code) == 5 and code in communes():
        return "commune"
    if len(code) in (2, 3) and code in departements():
        return "departement"
    return None


def territory_name(code: str) -> str | None:
    level = territory_level(code)
    if level == "commune":
        return communes()[code]
    if level == "departement":
        return departements()[code]
    return None


def _round_coords(obj: Any) -> Any:
    if isinstance(obj, float):
        return round(obj, 5)
    if isinstance(obj, list):
        return [_round_coords(x) for x in obj]
    return obj


def _load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_FILE.exists():
        return {}
    fc = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    return {f["properties"]["code"]: f for f in fc["features"]}


def _fetch(code: str) -> dict[str, Any] | None:
    q = urllib.parse.urlencode({"code": code, "format": "geojson", "geometry": "contour", "fields": "nom,code"})
    req = urllib.request.Request(f"{GEO_API}?{q}", headers={"User-Agent": "wellness-platform"})
    with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed https host
        fc = json.load(resp)
    feats = fc.get("features") or []
    if not feats:
        return None
    f = feats[0]
    return {"type": "Feature", "properties": {"code": code, "nom": f["properties"]["nom"]},
            "geometry": {"type": f["geometry"]["type"], "coordinates": _round_coords(f["geometry"]["coordinates"])}}


def commune_contours(codes: list[str], allow_fetch: bool = True) -> dict[str, Any]:
    valid = sorted({c for c in codes if territory_level(c) == "commune"})
    with _lock:
        cache = _load_cache()
        missing = [c for c in valid if c not in cache]
        fetched = False
        for code in missing if allow_fetch else []:
            try:
                feat = _fetch(code)
            except OSError:
                continue  # offline: the map falls back to the centroid-less list
            if feat:
                cache[code] = feat
                fetched = True
        if fetched:
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(
                json.dumps({"type": "FeatureCollection", "features": [cache[k] for k in sorted(cache)]},
                           ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
    return {"type": "FeatureCollection", "features": [cache[c] for c in valid if c in cache]}

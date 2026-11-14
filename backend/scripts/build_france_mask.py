"""Build the map assets that make only France stand out.

Usage (from backend/):  python -m scripts.build_france_mask

Reads   frontend/public/geo/departements.geojson (96 metropolitan departments)
Writes  frontend/public/geo/france-outline.geojson  France = union of departments (simplified)
        frontend/public/geo/france-mask.geojson     world rectangle with France cut out, used to grey
                                                    everything outside France on the map
Requires shapely (dev-only: requirements-dev.txt).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from shapely.geometry import MultiPolygon, mapping, shape
from shapely.ops import unary_union

GEO = Path(__file__).resolve().parents[2] / "frontend" / "public" / "geo"
TOLERANCE = 0.004  # degrees (~400 m): invisible at national zoom, keeps the file small
MIN_AREA = 0.002  # drop specks (tiny islets) from the mask holes


def _round(coords):
    return [[round(x, 4), round(y, 4)] for x, y in coords]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    depts = json.loads((GEO / "departements.geojson").read_text(encoding="utf-8"))
    france = unary_union([shape(f["geometry"]).buffer(0) for f in depts["features"]])
    france = france.buffer(0.0005).buffer(-0.0005)  # close hairline gaps between departments
    france = france.simplify(TOLERANCE, preserve_topology=True)
    parts = [p for p in (france.geoms if isinstance(france, MultiPolygon) else [france]) if p.area >= MIN_AREA]
    france = MultiPolygon(parts)

    outline = {"type": "FeatureCollection",
               "features": [{"type": "Feature", "properties": {"nom": "France métropolitaine"},
                             "geometry": mapping(france)}]}
    world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]
    holes = [_round(list(p.exterior.coords)) for p in parts]
    mask = {"type": "FeatureCollection",
            "features": [{"type": "Feature", "properties": {"role": "mask"},
                          "geometry": {"type": "Polygon", "coordinates": [world, *holes]}}]}

    (GEO / "france-outline.geojson").write_text(json.dumps(outline, separators=(",", ":")), encoding="utf-8")
    (GEO / "france-mask.geojson").write_text(json.dumps(mask, separators=(",", ":")), encoding="utf-8")
    print(f"{len(parts)} polygone(s) (continent + Corse…) → france-outline.geojson, france-mask.geojson")


if __name__ == "__main__":
    main()

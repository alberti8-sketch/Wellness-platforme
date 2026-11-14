"use client";

import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useState } from "react";

// Decorative pins (no data): a few WP25 cities, coloured with the three band colours.
const PINS: [number, number, string][] = [
  [48.117, -1.678, "#1F8A78"], // Rennes
  [47.218, -1.554, "#D4A33A"], // Nantes
  [48.39, -4.486, "#1F8A78"], // Brest
  [43.296, 5.37, "#D4A33A"], // Marseille
  [43.71, 7.262, "#1F8A78"], // Nice
  [45.899, 6.129, "#1F8A78"], // Annecy
  [47.238, 6.024, "#D4A33A"], // Besançon
  [48.864, 2.443, "#C8513A"], // Montreuil
  [46.16, -1.151, "#1F8A78"], // La Rochelle
  [42.505, 2.035, "#1F8A78"], // Font-Romeu
];

const W = 600;
const LON0 = -5.3;
const LON1 = 9.7;
const LAT0 = 41.25;
const LAT1 = 51.2;
const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const K = W / (LON1 - LON0);
const Y1 = merc(LAT1);
const H = Math.round((Y1 - merc(LAT0)) * (180 / Math.PI) * K);
const project = (lon: number, lat: number): [number, number] => [(lon - LON0) * K, (Y1 - merc(lat)) * (180 / Math.PI) * K];

export function FranceSilhouette() {
  const [d, setD] = useState<string | null>(null);
  useEffect(() => {
    fetch("/geo/france-outline.geojson")
      .then((r) => r.json() as Promise<FeatureCollection<Polygon | MultiPolygon>>)
      .then((fc) => {
        const polys = fc.features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
        setD(
          polys
            .map((rings) =>
              rings
                .map((ring) => "M" + ring.map(([lon, lat]) => project(lon, lat).map((v) => v.toFixed(1)).join(",")).join("L") + "Z")
                .join(""),
            )
            .join(""),
        );
      })
      .catch(() => setD(null));
  }, []);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden>
      {d && <path d={d} fill="#FFFFFF" stroke="#CFCFC8" strokeWidth={1.5} strokeLinejoin="round" />}
      {d &&
        PINS.map(([lat, lon, c], i) => {
          const [x, y] = project(lon, lat);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={7} fill={c} opacity={0.25} className="landing-ping" style={{ animationDelay: `${(i % 5) * 0.45}s` }} />
              <circle cx={x} cy={y} r={7} fill={c} stroke="#FFFFFF" strokeWidth={2.5} />
            </g>
          );
        })}
    </svg>
  );
}

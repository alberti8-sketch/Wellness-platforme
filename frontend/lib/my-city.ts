"use client";

import type { FeatureCollection, Geometry, Position } from "geojson";
import { api } from "./api";
import { TYPE_LABEL } from "./metrics";
import type { Territory } from "./types";

export type LocateStatus = "idle" | "locating" | "found" | "denied" | "unavailable";

export interface MyCity {
  code: string;
  distanceKm: number;
}

export interface Similar {
  code: string;
  reasons: string[];
}

/** Rough centre of a commune contour (mean of its vertices): enough to find the nearest city. */
function centre(g: Geometry): [number, number] | null {
  const pts: Position[] = [];
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as Position);
    else if (Array.isArray(c)) c.forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  if (!pts.length) return null;
  const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [lat, lon];
}

function haversineKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function position(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.latitude, p.coords.longitude]),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable")),
      { timeout: 10000, maximumAge: 3600_000, enableHighAccuracy: false },
    );
  });
}

/**
 * The tracked city nearest to the user. The position stays in the browser: only the
 * tracked cities' contours are fetched (from our own API) to compare distances.
 */
export async function locateMyCity(territories: Territory[]): Promise<MyCity> {
  const communes = territories.filter((t) => t.code.length === 5);
  if (!communes.length) throw new Error("unavailable");
  const [me, shapes] = await Promise.all([
    position(),
    api.get<FeatureCollection<Geometry, { code: string }>>(`/api/geo/communes?codes=${communes.map((t) => t.code).join(",")}`),
  ]);
  let best: MyCity | null = null;
  for (const f of shapes.features) {
    const c = centre(f.geometry);
    if (!c) continue;
    const d = haversineKm(me, c);
    if (!best || d < best.distanceKm) best = { code: f.properties.code, distanceKm: d };
  }
  if (!best) throw new Error("unavailable");
  return best;
}

const log = (v: number | null | undefined) => (v && v > 0 ? Math.log10(v) : null);

/** The most similar other city: same type first, then closest population and density (log scale). */
export function similarCity(mine: Territory, territories: Territory[]): Similar | null {
  const a = mine.context;
  let best: { t: Territory; d: number } | null = null;
  for (const t of territories) {
    if (t.code === mine.code || t.code.length !== mine.code.length) continue;
    const b = t.context;
    const sameType = !!a.territory_type && a.territory_type === b.territory_type;
    const dp = log(a.population) != null && log(b.population) != null ? Math.abs(log(a.population)! - log(b.population)!) : 1;
    const dd = log(a.density_km2) != null && log(b.density_km2) != null ? Math.abs(log(a.density_km2)! - log(b.density_km2)!) : 1;
    const d = (sameType ? 0 : 2) + dp + 0.5 * dd;
    if (!best || d < best.d) best = { t, d };
  }
  if (!best) return null;
  const b = best.t.context;
  const reasons: string[] = [];
  if (a.territory_type && a.territory_type === b.territory_type) reasons.push(`même type (${(TYPE_LABEL[a.territory_type] ?? a.territory_type).toLowerCase()})`);
  if (a.population && b.population) {
    const ratio = Math.max(a.population, b.population) / Math.min(a.population, b.population);
    reasons.push(ratio < 1.6 ? "population proche" : "population la plus proche parmi les villes suivies");
  }
  return { code: best.t.code, reasons };
}

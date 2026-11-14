"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

export type TerritoryProps = { code: string; nom: string };
export type TerritoryCollection = FeatureCollection<Geometry, TerritoryProps>;
export type TerritoryFeature = Feature<Geometry, TerritoryProps>;
/** @deprecated kept for older imports */
export type DeptCollection = TerritoryCollection;

let deptCache: Promise<TerritoryCollection> | null = null;
const communeCache = new Map<string, TerritoryFeature>();

function loadDepartements(): Promise<TerritoryCollection> {
  deptCache ??= fetch("/geo/departements.geojson").then((r) => {
    if (!r.ok) throw new Error("Contours géographiques introuvables");
    return r.json() as Promise<TerritoryCollection>;
  });
  return deptCache;
}

export function useDepartements() {
  const [geo, setGeo] = useState<TerritoryCollection | null>(null);
  useEffect(() => {
    loadDepartements().then(setGeo).catch(() => setGeo(null));
  }, []);
  const list = geo ? geo.features.map((f) => f.properties).sort((a, b) => a.code.localeCompare(b.code)) : [];
  return { geo, list };
}

/**
 * Contours for the territories to colour: départements come from the static file,
 * communes from the API (served from the backend cache, fetched once per session).
 */
export function useTerritoryShapes(codes: string[]) {
  const { geo: depts } = useDepartements();
  const [, setTick] = useState(0);
  const key = [...codes].sort().join(",");

  useEffect(() => {
    const missing = key.split(",").filter((c) => c.length === 5 && !communeCache.has(c));
    if (!missing.length) return;
    let cancelled = false;
    api
      .get<TerritoryCollection>(`/api/geo/communes?codes=${missing.join(",")}`)
      .then((fc) => {
        fc.features.forEach((f) => communeCache.set(f.properties.code, f));
        if (!cancelled) setTick((t) => t + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  const shapes = useMemo<TerritoryCollection | null>(() => {
    if (!depts) return null;
    const wanted = new Set(key.split(","));
    const features: TerritoryFeature[] = [
      ...depts.features.filter((f) => wanted.has(f.properties.code)),
      ...[...wanted].map((c) => communeCache.get(c)).filter((f): f is TerritoryFeature => !!f),
    ];
    return { type: "FeatureCollection", features };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depts, key, communeCache.size]);

  return { departements: depts, shapes };
}

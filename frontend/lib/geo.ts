"use client";

import type { Feature, FeatureCollection, Geometry } from "geojson";
import { useEffect, useState } from "react";

export type TerritoryProps = { code: string; nom: string };
export type TerritoryCollection = FeatureCollection<Geometry, TerritoryProps>;
export type TerritoryFeature = Feature<Geometry, TerritoryProps>;

let deptCache: Promise<TerritoryCollection> | null = null;

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

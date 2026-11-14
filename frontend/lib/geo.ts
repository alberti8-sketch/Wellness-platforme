"use client";

import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useState } from "react";

export type DeptCollection = FeatureCollection<Geometry, { code: string; nom: string }>;

let cache: Promise<DeptCollection> | null = null;

function load(): Promise<DeptCollection> {
  cache ??= fetch("/geo/departements.geojson").then((r) => {
    if (!r.ok) throw new Error("Contours géographiques introuvables");
    return r.json() as Promise<DeptCollection>;
  });
  return cache;
}

export function useDepartements() {
  const [geo, setGeo] = useState<DeptCollection | null>(null);
  useEffect(() => {
    load().then(setGeo).catch(() => setGeo(null));
  }, []);
  const list = geo ? geo.features.map((f) => f.properties).sort((a, b) => a.code.localeCompare(b.code)) : [];
  return { geo, list };
}

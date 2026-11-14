"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// ---- /api/trends/pathologies (Assurance Maladie, data.ameli.fr, department level) ----
export type PathoKey = "diabete"; // diabetes is the single disease kept as an example
export const PATHO_LABEL: Record<PathoKey, string> = { diabete: "Diabète" };

export interface TrendPoint {
  year: number;
  prev: number;
  ntop: number;
  npop: number;
}
export interface TrendSeries {
  departement: string | null;
  points: TrendPoint[];
  error: string | null;
  stale?: boolean;
}
export interface TrendsResponse {
  patho: PathoKey;
  label: string;
  source: string;
  level: string;
  unit: string;
  obesity_available: boolean;
  note: string;
  series: Record<string, TrendSeries>;
}

// ---- /api/food-environment (OpenStreetMap, Overpass) ----
export interface FoodPoint {
  lat: number;
  lon: number;
  name: string | null;
  kind: string;
  cuisine?: string | null;
}
export interface FoodTerritory {
  name: string;
  population: number | null;
  counts: { fast_food: number; restaurant: number; cafe: number } | null;
  fast_food_per_10k: number | null;
  points?: FoodPoint[];
  error: string | null;
}
export interface FoodResponse {
  source: string;
  note: string;
  categories: Record<string, string>;
  territories: Record<string, FoodTerritory>;
}

/** Small communes make per-10k ratios unstable (tourism, a handful of outlets). */
export const SMALL_POPULATION = 5000;

const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = load().catch((e) => {
      cache.delete(key); // retry on next use
      throw e;
    });
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

function useCachedFetch<T>(key: string | null, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!key) {
      setData(null);
      return;
    }
    let off = false;
    setLoading(true);
    setError(null);
    cached(key, load)
      .then((d) => !off && setData(d))
      .catch((e: Error) => !off && setError(e.message))
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading };
}

const codesKey = (codes: string[]) => [...new Set(codes)].sort().join(",");

export function useTrends(codes: string[], patho: PathoKey = "diabete") {
  const k = codesKey(codes);
  return useCachedFetch<TrendsResponse>(k ? `trends:${patho}:${k}` : null, () =>
    api.get<TrendsResponse>(`/api/trends/pathologies?territories=${encodeURIComponent(k)}&patho=${patho}`),
  );
}

export function useFood(codes: string[], includePoints = false) {
  const k = codesKey(codes.filter((c) => c.length === 5));
  return useCachedFetch<FoodResponse>(k ? `food:${includePoints}:${k}` : null, () =>
    api.get<FoodResponse>(`/api/food-environment?territories=${encodeURIComponent(k)}&include_points=${includePoints}`),
  );
}

export function trendDelta(points: TrendPoint[] | undefined) {
  if (!points || points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return { from: first, to: last, abs: last.prev - first.prev, rel: first.prev ? (last.prev - first.prev) / first.prev : null };
}

"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

export type PredPatho = "diabete" | "cardio" | "respiratoire" | "cancers";
export type FeatureKey = "pct_65plus" | "density_km2" | "poverty_rate" | "fastfood_per10k" | "sport_per10k";

export interface TreeNode {
  id: number;
  leaf: boolean;
  feature: FeatureKey | null;
  threshold: number | null;
  left: number | null; // condition true: feature <= threshold
  right: number | null;
  value: number;
  samples: number;
  departements: { code: string; name: string; prev: number }[] | null;
}

export interface ModelInfo {
  patho: PredPatho;
  label: string;
  pathologies: Record<PredPatho, string>;
  year: number;
  unit: string;
  features: Record<FeatureKey, { label: string; unit: string; source: string }>;
  params: { max_depth: number; min_samples_leaf: number };
  metrics: { n: number; mae_cv: number; mae_baseline: number; gain_vs_baseline_pct: number; r2_cv: number; target_mean: number; target_min: number; target_max: number };
  importances: Record<FeatureKey, number>;
  nodes: TreeNode[];
  source: string;
  caveat: string;
}

export interface PathStep {
  node: number;
  feature: FeatureKey;
  threshold: number;
  value: number;
  condition: "<=" | ">";
}

export interface Prediction {
  name: string | null;
  departement: string;
  features: Record<FeatureKey, number>;
  feature_levels: Record<FeatureKey, "commune" | "departement">;
  prediction: number;
  leaf: number;
  path: PathStep[];
  observed_departement: number | null;
  gap: number | null;
  error: string | null;
}

const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, load().catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key) as Promise<T>;
}

function useLoad<T>(key: string | null, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!key) return;
    let off = false;
    setError(null);
    once(key, load)
      .then((d) => !off && setData(d))
      .catch((e: Error) => !off && setError(e.message));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, error, loading: !!key && !data && !error };
}

export const useModel = (patho: PredPatho) => useLoad<ModelInfo>(`model:${patho}`, () => api.get<ModelInfo>(`/api/prediction/model?patho=${patho}`));

export function usePredictions(codes: string[], patho: PredPatho) {
  const k = [...new Set(codes)].sort().join(",");
  return useLoad<{ territories: Record<string, Prediction> }>(k ? `pred:${patho}:${k}` : null, () =>
    api.get(`/api/prediction/territories?territories=${encodeURIComponent(k)}&patho=${patho}`),
  );
}

export const simulate = (patho: PredPatho, features: Record<FeatureKey, number>) =>
  api.post<{ prediction: number; leaf: number; path: PathStep[] }>("/api/prediction/simulate", { patho, ...features });

// ---- Department-level indicators (map) ----
export interface DeptIndicator {
  label: string;
  unit: string;
  source: string;
  direction: "lower_is_better" | "higher_is_better" | null;
}
export interface DeptData {
  year: number;
  indicators: Record<string, DeptIndicator>;
  departements: { code: string; name: string; values: Record<string, number | null> }[];
}
export const useDepartementData = () => useLoad<DeptData>("departements", () => api.get<DeptData>("/api/prediction/departements"));

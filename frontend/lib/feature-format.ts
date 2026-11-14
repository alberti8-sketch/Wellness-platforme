"use client";

import { fmt } from "@/lib/bands";
import type { FeatureKey } from "@/lib/prediction";

export const FEATURE_SHORT: Record<FeatureKey, string> = {
  pct_65plus: "65 ans et +",
  density_km2: "Densité",
  poverty_rate: "Pauvreté",
  fastfood_per10k: "Restauration rapide",
  sport_per10k: "Équipements sportifs",
};
const UNIT_SHORT: Record<FeatureKey, string> = {
  pct_65plus: " %",
  density_km2: " hab/km²",
  poverty_rate: " %",
  fastfood_per10k: " /10k",
  sport_per10k: " /10k",
};
export const fmtFeature = (k: FeatureKey, v: number) => `${fmt(v, k === "density_km2" ? 0 : 1)}${UNIT_SHORT[k]}`;

// Sequential blue ramp (reference palette, light → dark) for predicted prevalence.
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"];
export function rampColor(v: number, min: number, max: number) {
  const t = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0.5;
  const i = Math.round(t * (RAMP.length - 1));
  return { bg: RAMP[i], fg: i >= 6 ? "#ffffff" : "#0b0b0b" };
}

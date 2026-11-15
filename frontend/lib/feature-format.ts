"use client";

import { fmt } from "@/lib/bands";
import type { FeatureKey } from "@/lib/prediction";

export const FEATURE_SHORT: Record<FeatureKey, string> = {
  pct_65plus: "Habitants de 65 ans et plus",
  density_km2: "Densité de population",
  poverty_rate: "Habitants pauvres",
  fastfood_per10k: "Fast-foods",
  sport_per10k: "Équipements sportifs",
};
const UNIT_SHORT: Record<FeatureKey, string> = {
  pct_65plus: " %",
  density_km2: " hab./km²",
  poverty_rate: " %",
  fastfood_per10k: " pour 10 000 hab.",
  sport_per10k: " pour 10 000 hab.",
};
export const fmtFeature = (k: FeatureKey, v: number) => `${fmt(v, k === "density_km2" ? 0 : 1)}${UNIT_SHORT[k]}`;

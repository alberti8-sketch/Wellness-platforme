import type { Catalog } from "./types";

/** Dimension identity colours (maquette): fixed per dimension, never by rank. */
export const DIM_COLOR: Record<string, string> = {
  SPORT: "#3E63DD",
  ENV: "#2F9E6E",
  HEALTH: "#8E4EC6",
  SOCIAL: "#E5741D",
  CLIN: "#80838D",
};

export const TYPE_LABEL: Record<string, string> = { urbain: "Ville", "semi-urbain": "Ville moyenne", rural: "Commune rurale" };

export type Metric = { kind: "composite" } | { kind: "dim"; code: string } | { kind: "ind"; code: string };

export function metricLabel(m: Metric, catalog: Catalog) {
  if (m.kind === "composite") return "Score";
  if (m.kind === "dim") return catalog.dimensions.find((d) => d.code === m.code)?.label ?? m.code;
  return catalog.indicators.find((i) => i.code === m.code)?.label ?? m.code;
}

export const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};

/** Categorical series colours for compared territories (validated reference palette, fixed order, follow the entity). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6"];

import type { Catalog, DimensionScore, Territory } from "./types";

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

export const metricKey = (m: Metric) => (m.kind === "composite" ? "composite" : `${m.kind}:${m.code}`);

export function parseMetric(k: string): Metric {
  if (k === "composite") return { kind: "composite" };
  const [kind, code] = k.split(":");
  return { kind: kind as "dim" | "ind", code };
}

export function metricLabel(m: Metric, catalog: Catalog) {
  if (m.kind === "composite") return "Indice de bien-être";
  if (m.kind === "dim") return catalog.dimensions.find((d) => d.code === m.code)?.label ?? m.code;
  return catalog.indicators.find((i) => i.code === m.code)?.label ?? m.code;
}

export function metricValue(t: Territory, m: Metric): DimensionScore & { raw?: number | null } {
  if (m.kind === "composite") return t.composite;
  if (m.kind === "dim") return t.dimensions[m.code] ?? { score: null, band: null, coverage: 0 };
  const c = t.indicators[m.code];
  return { score: c?.score ?? null, band: c?.band ?? null, coverage: c?.score != null ? 1 : 0, raw: c?.raw_value ?? null };
}

export const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
};

/** Categorical series colours for compared territories (validated reference palette, fixed order, follow the entity). */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6"];

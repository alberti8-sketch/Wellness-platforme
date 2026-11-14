"use client";

import { useMemo } from "react";
import { api } from "./api";
import { useLoad } from "./prediction";

export type Direction = "lower_is_better" | "higher_is_better" | null;

export interface CommuneIndicator {
  domain: string;
  label: string;
  unit: string;
  direction: Direction;
  source: string;
  classes?: "walk";
}

export interface Commune {
  code: string;
  name: string;
  dep: string;
  population: number;
  lat: number;
  lon: number;
  walk_class: string | null;
  size_class: string;
  sport_rate_size: number | null;
  values: Record<string, number | null>;
}

interface Payload {
  year: number;
  indicators: Record<string, CommuneIndicator>;
  walk_classes: string[];
  sport_rate: { source: string; by_size: Record<string, { rate: number; label: string }> };
  columns: string[];
  rows: (string | number | null)[][];
}

const TEXT = new Set(["code", "name", "dep", "walk_class", "size_class"]);

export function useCommuneDomains() {
  const res = useLoad<Payload>("communes-domaines", () => api.get<Payload>("/api/communes/domaines"));
  const communes = useMemo<Commune[]>(() => {
    const d = res.data;
    if (!d) return [];
    const idx = Object.fromEntries(d.columns.map((c, i) => [c, i]));
    return d.rows.map((r) => {
      const values: Record<string, number | null> = {};
      d.columns.forEach((c, i) => {
        if (!TEXT.has(c)) values[c] = r[i] as number | null;
      });
      return {
        code: r[idx.code] as string,
        name: r[idx.name] as string,
        dep: r[idx.dep] as string,
        population: (r[idx.population] as number) ?? 0,
        lat: r[idx.lat] as number,
        lon: r[idx.lon] as number,
        walk_class: (r[idx.walk_class] as string) || null,
        size_class: r[idx.size_class] as string,
        sport_rate_size: r[idx.sport_rate_size] as number | null,
        values,
      };
    });
  }, [res.data]);
  return { meta: res.data, communes, error: res.error, loading: res.loading };
}

// ---- Classes & colours ----

/** Diverging ramp, unfavourable → favourable, neutral middle (no hue at the midpoint). */
export const DIVERGING = ["#B5442C", "#E0875A", "#DCCCA6", "#78B3A2", "#1E7462"];
/** Sequential ramp for context indicators (no "better" end). */
export const SEQUENTIAL = ["#D9E7EE", "#A9C9D8", "#77A5BB", "#3F7FA0", "#0B5E80"];
/** Baromètre des villes marchables classes, A+ (best) → G (worst). */
export const WALK_COLORS: Record<string, string> = {
  "A+": "#0F5446",
  A: "#1E7462",
  B: "#5FA390",
  C: "#A8CDBF",
  D: "#DCCCA6",
  E: "#E8A877",
  F: "#D06B43",
  G: "#A3381F",
};
export const NO_DATA = "#B9BAB4";

export interface LegendClass {
  label: string;
  color: string;
  count: number;
  test: (v: number) => boolean;
}

const nice = (x: number) => {
  if (x === 0) return 0;
  const p = 10 ** Math.floor(Math.log10(Math.abs(x)));
  const step = p >= 10 ? p / 2 : p / 10;
  return Math.round(x / step) * step;
};

const fmtNum = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: v < 10 ? 1 : 0 });

/** Five quintile classes on the given values, coloured by direction (favourable end in green). */
export function quintileClasses(values: number[], direction: Direction): LegendClass[] {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return [];
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const cuts = [...new Set([0.2, 0.4, 0.6, 0.8].map((p) => nice(q(p))))];
  const ramp = direction === null ? SEQUENTIAL : direction === "higher_is_better" ? DIVERGING : [...DIVERGING].reverse();
  const bounds = [-Infinity, ...cuts, Infinity];
  const n = bounds.length - 1;
  // Spread colours over the ramp when rounding merged two cuts.
  const colorAt = (i: number) => ramp[n === 5 ? i : Math.round((i * (ramp.length - 1)) / Math.max(1, n - 1))];
  return Array.from({ length: n }, (_, i) => {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    const label = lo === -Infinity ? `moins de ${fmtNum(hi)}` : hi === Infinity ? `${fmtNum(lo)} et plus` : `${fmtNum(lo)} à ${fmtNum(hi)}`;
    const test = (v: number) => v >= lo && v < hi;
    return { label, color: colorAt(i), count: values.filter(test).length, test };
  });
}

export const median = (values: number[]) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The 8 « CITY » communes of the WP25 panel (quick access in the search box). */
export const OUR_CITIES = ["74010", "35238", "44109", "29019", "25056", "93048", "06088", "13055"];

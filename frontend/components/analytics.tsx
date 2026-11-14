"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Overview, Territory, TerritoryType } from "@/lib/types";
import { useSession } from "./session";

export const MAX_COMPARE = 4;
const WEIGHTS_KEY = "wellness.weights";

interface Analytics {
  overview: Overview | null;
  territories: Territory[];
  loading: boolean;
  error: string | null;
  weights: Record<string, number> | null;
  defaults: Record<string, number> | null;
  setWeights: (w: Record<string, number>) => void;
  resetWeights: () => void;
  isCustom: boolean;
  weightsParam: string;
  period: number | null;
  setPeriod: (p: number | null) => void;
  ttype: TerritoryType | "";
  setTtype: (t: TerritoryType | "") => void;
  selected: string | null;
  open: (code: string | null) => void;
  compare: string[];
  toggleCompare: (code: string) => void;
  setCompareList: (codes: string[]) => void;
  clearCompare: () => void;
  rankOf: (code: string) => number;
  byCode: Record<string, Territory>;
}

const Ctx = createContext<Analytics | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { ready, catalog, apiKey } = useSession();
  const defaults = useMemo(() => (catalog ? Object.fromEntries(catalog.dimensions.map((d) => [d.code, d.default_weight])) : null), [catalog]);
  const [weights, setWeightsState] = useState<Record<string, number> | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const [ttype, setTtype] = useState<TerritoryType | "">("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  // Weights: per-viewer convenience, remembered locally (never shared, never required).
  useEffect(() => {
    if (!defaults) return;
    let stored: Record<string, number> | null = null;
    try {
      const raw = window.localStorage.getItem(WEIGHTS_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      /* storage unavailable */
    }
    const valid = stored && Object.keys(defaults).every((k) => typeof stored![k] === "number");
    setWeightsState(valid ? stored : defaults);
  }, [defaults]);

  const setWeights = useCallback((w: Record<string, number>) => {
    setWeightsState(w);
    try {
      window.localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
    } catch {
      /* storage unavailable */
    }
  }, []);
  const resetWeights = useCallback(() => {
    if (!defaults) return;
    setWeightsState(defaults);
    try {
      window.localStorage.removeItem(WEIGHTS_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [defaults]);

  // Account switch: drop everything tenant-specific (not on first mount, so deep links survive).
  const prevKey = useRef(apiKey);
  useEffect(() => {
    if (prevKey.current === apiKey) return;
    prevKey.current = apiKey;
    setSelected(null);
    setCompare([]);
    setPeriod(null);
    setOverview(null);
  }, [apiKey]);

  const weightsParam = useMemo(
    () =>
      Object.entries(weights ?? {})
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
    [weights],
  );

  useEffect(() => {
    if (!ready || !weights) return;
    const t = setTimeout(() => {
      setLoading(true);
      const q = new URLSearchParams({ weights: weightsParam });
      if (period) q.set("period", String(period));
      if (ttype) q.set("territory_type", ttype);
      api
        .get<Overview>(`/api/analytics/overview?${q}`)
        .then((o) => {
          setOverview(o);
          setError(null);
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [ready, weights, weightsParam, period, ttype, apiKey]);

  // Deep link ?territoire=<code> opens the side panel; keep the URL in sync (shareable).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("territoire");
      if (code) setSelected(code.toUpperCase());
      const cmp = params.get("comparer");
      if (cmp) setCompare(cmp.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean).slice(0, MAX_COMPARE));
    } catch {
      /* no URL access */
    }
  }, []);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selected) url.searchParams.set("territoire", selected);
      else url.searchParams.delete("territoire");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* no URL access */
    }
  }, [selected]);

  const territories = useMemo(() => overview?.territories ?? [], [overview]);
  const byCode = useMemo(() => Object.fromEntries(territories.map((t) => [t.code, t])), [territories]);
  const ranks = useMemo(() => {
    const sorted = [...territories].sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1));
    return Object.fromEntries(sorted.map((t, i) => [t.code, i + 1]));
  }, [territories]);

  // Close the panel / prune comparison when territories disappear (filters, account), once data is loaded.
  useEffect(() => {
    if (!overview) return;
    if (selected && !byCode[selected]) setSelected(null);
    setCompare((c) => c.filter((code) => byCode[code]));
  }, [overview, byCode, selected]);

  const toggleCompare = useCallback((code: string) => {
    setCompare((c) => (c.includes(code) ? c.filter((x) => x !== code) : c.length >= MAX_COMPARE ? [...c.slice(1), code] : [...c, code]));
  }, []);

  const value = useMemo<Analytics>(
    () => ({
      overview,
      territories,
      loading,
      error,
      weights,
      defaults,
      setWeights,
      resetWeights,
      isCustom: !!weights && !!defaults && Object.keys(defaults).some((k) => weights[k] !== defaults[k]),
      weightsParam,
      period,
      setPeriod,
      ttype,
      setTtype,
      selected,
      open: setSelected,
      compare,
      toggleCompare,
      setCompareList: (codes: string[]) => setCompare([...new Set(codes)].slice(0, MAX_COMPARE)),
      clearCompare: () => setCompare([]),
      rankOf: (code: string) => ranks[code] ?? 0,
      byCode,
    }),
    [overview, territories, loading, error, weights, defaults, setWeights, resetWeights, weightsParam, period, ttype, selected, compare, toggleCompare, ranks, byCode],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAnalytics(): Analytics {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAnalytics must be used within AnalyticsProvider");
  return ctx;
}

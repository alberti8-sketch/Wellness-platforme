"use client";

import type { ReactNode } from "react";
import { fmt } from "@/lib/bands";
import { TYPE_LABEL } from "@/lib/metrics";
import type { Catalog, Territory } from "@/lib/types";
import { cx } from "./ui";

type Row = {
  label: ReactNode;
  values: (number | null)[];
  format?: (v: number | null) => string;
  /** Which end is "better" for highlighting; null = no highlight (context). */
  better?: "high" | "low" | null;
  group?: boolean;
};

export interface ExtraRow {
  section: string;
  label: string;
  values: (number | null)[];
  format?: (v: number | null) => string;
  better?: "high" | "low" | null;
}

/** Side-by-side comparison: best value per row in bold, spread (max − min) in the last column. */
export function CompareTable({
  territories,
  catalog,
  colors,
  extra = [],
}: {
  territories: Territory[];
  catalog: Catalog;
  colors: string[];
  extra?: ExtraRow[];
}) {
  const score = (v: number | null) => fmt(v);
  const rows: (Row | { section: string })[] = [
    { label: "Indice de bien-être", values: territories.map((t) => t.composite.score), better: "high", group: true },
    { section: "Dimensions (1–10)" },
    ...catalog.dimensions.map((d) => ({
      label: d.is_outcome ? `${d.label} (résultat)` : d.label,
      values: territories.map((t) => t.dimensions[d.code]?.score ?? null),
      better: "high" as const,
    })),
    { section: "Indicateurs (valeur brute)" },
    ...catalog.indicators.map((i) => ({
      label: (
        <>
          {i.label} <span className="text-xs text-ink-muted">· {i.unit}</span>
        </>
      ),
      values: territories.map((t) => t.indicators[i.code]?.raw_value ?? null),
      format: (v: number | null) => fmt(v, 1),
      better: i.direction === "higher_is_better" ? ("high" as const) : ("low" as const),
    })),
    { section: "Contexte" },
    { label: "Population", values: territories.map((t) => t.context.population), format: (v) => (v == null ? "—" : `${fmt(v, 0)} hab.`), better: null },
    { label: "Densité (hab./km²)", values: territories.map((t) => t.context.density_km2), format: (v) => fmt(v, 0), better: null },
    { label: "Score global source (/100)", values: territories.map((t) => t.context.source_global_score), format: (v) => fmt(v, 0), better: null },
  ];
  // Extra rows (e.g. disease trends, food environment), grouped by section.
  let lastSection = "";
  for (const r of extra) {
    if (r.section !== lastSection) {
      rows.push({ section: r.section });
      lastSection = r.section;
    }
    rows.push({ label: r.label, values: r.values, format: r.format, better: r.better ?? null });
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-xs text-ink-muted">
            <th className="py-2 pr-3 text-left font-medium">Critère</th>
            {territories.map((t, i) => (
              <th key={t.code} className="px-2 py-2 text-right font-medium">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[i] }} aria-hidden />
                  {t.name}
                </span>
                <span className="block font-normal">{t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : t.code}</span>
              </th>
            ))}
            <th className="py-2 pl-2 text-right font-medium" title="Écart entre la valeur la plus haute et la plus basse">
              Écart
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            if ("section" in r) {
              return (
                <tr key={`s${idx}`}>
                  <td colSpan={territories.length + 2} className="pb-1 pt-4 text-xs font-semibold text-ink-muted">
                    {r.section}
                  </td>
                </tr>
              );
            }
            const nums = r.values.filter((v): v is number => v != null);
            const best = r.better && nums.length > 1 ? (r.better === "high" ? Math.max(...nums) : Math.min(...nums)) : null;
            const spread = r.better && nums.length > 1 ? Math.max(...nums) - Math.min(...nums) : null;
            const f = r.format ?? score;
            return (
              <tr key={idx} className={cx("border-b border-[#F2F2EE]", r.group && "bg-[#FAFAF7]")}>
                <td className={cx("py-2 pr-3 text-ink-2", r.group && "font-semibold text-ink")}>{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className={cx("num px-2 py-2 text-right", v != null && v === best ? "font-semibold text-ink" : "text-ink-2")}>
                    {v == null ? <span className="text-ink-faint">—</span> : f(v)}
                    {v != null && v === best && <span className="sr-only"> (meilleure valeur)</span>}
                  </td>
                ))}
                <td className="num py-2 pl-2 text-right text-ink-muted">{spread == null ? "—" : f(spread)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-ink-muted">En gras : la meilleure valeur de la ligne (selon le sens de l'indicateur). Contexte : non comparé.</p>
    </div>
  );
}

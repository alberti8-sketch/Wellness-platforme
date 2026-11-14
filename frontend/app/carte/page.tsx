"use client";

import { Check } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { NextStep } from "@/components/next-step";
import { ScaleBar, ScaleLegend, seqColor } from "@/components/scale-bar";
import type { MapValue } from "@/components/territory-map";
import { ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { fmt } from "@/lib/bands";
import { useDepartements } from "@/lib/geo";
import { mean } from "@/lib/metrics";
import { useDepartementData } from "@/lib/prediction";

const TerritoryMap = dynamic(() => import("@/components/territory-map"), { ssr: false, loading: () => <Spinner label="Chargement de la carte…" /> });

// Indicators offered on the map, in display order (department level, 96 metropolitan departments).
const GROUPS: { label: string; keys: string[] }[] = [
  { label: "Maladies chroniques (prévalence)", keys: ["prev_diabete", "prev_cardio", "prev_respiratoire", "prev_cancers"] },
  { label: "Facteurs", keys: ["poverty_rate", "fastfood_per10k", "sport_per10k", "pct_65plus"] },
];
const SHORT: Record<string, string> = {
  prev_diabete: "Diabète",
  prev_cardio: "Maladies cardioneurovasculaires",
  prev_respiratoire: "Maladies respiratoires chroniques",
  prev_cancers: "Cancers",
  poverty_rate: "Taux de pauvreté",
  fastfood_per10k: "Restauration rapide pour 10 000 hab.",
  sport_per10k: "Équipements sportifs pour 10 000 hab.",
  pct_65plus: "Part des 65 ans et plus",
};

export default function CartePage() {
  const { geo } = useDepartements();
  const data = useDepartementData();
  const [key, setKey] = useState("prev_diabete");
  const [focus, setFocus] = useState<string | null>(null);

  // Shareable view: /carte?indicateur=poverty_rate&dep=35
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const k = q.get("indicateur");
      if (k && SHORT[k]) setKey(k);
      const d = q.get("dep");
      if (d) setFocus(d.toUpperCase());
    } catch {
      /* no URL access */
    }
  }, []);

  const d = data.data;
  const ind = d?.indicators[key];
  const rows = useMemo(() => d?.departements ?? [], [d]);
  const nums = rows.map((r) => r.values[key]).filter((v): v is number => v != null);
  const lo = nums.length ? Math.floor(Math.min(...nums)) : 0;
  const hi = nums.length ? Math.ceil(Math.max(...nums)) : 1;
  const unit = ind?.unit === "%" ? " %" : ind ? ` ${ind.unit}` : "";
  const format = (v: number) => `${fmt(v, 1)}${unit}`;
  const avg = mean(nums);
  const better = ind?.direction === "lower_is_better" ? "low" : ind?.direction === "higher_is_better" ? "high" : null;

  const values: Record<string, MapValue> = Object.fromEntries(
    rows.map((r) => {
      const v = r.values[key];
      return [r.code, { name: r.name, score: null, band: null, fill: seqColor(v, lo, hi), display: v == null ? "—" : format(v) }];
    }),
  );
  const focusRow = focus ? rows.find((r) => r.code === focus) ?? null : null;
  const focusV = focusRow?.values[key] ?? null;
  const isBetter = focusV != null && avg != null && better != null && (better === "high" ? focusV > avg : focusV < avg);
  const label = SHORT[key] ?? ind?.label ?? key;
  // The poverty rate is the INSEE 2021 release; the other indicators are from the dataset year.
  const year = key === "poverty_rate" ? 2021 : d?.year;

  return (
    <div>
      <PageHeader title="Carte de France" subtitle="Choisissez un indicateur, puis cliquez un département pour le situer par rapport aux autres." />

      {data.error && <ErrorBox>{data.error}</ErrorBox>}
      <section className="rounded-card border border-hairline bg-white p-5 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[#14285A] md:text-[28px]">
              {label} {focusRow ? `· ${focusRow.name}` : "en France"}
            </h2>
            <p className="mt-2 text-[13px] text-ink-2">
              <strong className="font-semibold text-ink">Source :</strong> {ind?.source ?? "…"}
              {d && key !== "poverty_rate" ? `, ${year}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="indicateur">
              Indicateur
            </label>
            <select id="indicateur" className="input h-10 w-auto min-w-[260px]" value={key} onChange={(e) => setKey(e.target.value)}>
              {GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.keys.map((k) => (
                    <option key={k} value={k}>
                      {SHORT[k]}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {focusRow && (
              <button className="secondary-btn h-10" onClick={() => setFocus(null)}>
                Vue France
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 h-[620px]">
          {geo && d ? (
            <TerritoryMap
              departements={geo}
              shapes={geo}
              values={values}
              selected={focus}
              onSelect={(code) => setFocus((f) => (f === code ? null : code))}
              metricLabel={label}
              focus={focus}
              showPins={false}
              showDeptOverlay={false}
              focusMaxZoom={8.5}
            />
          ) : (
            <Spinner label="Chargement de la carte…" />
          )}
        </div>

        <div className="mt-8">
          <ScaleBar min={lo} max={hi} value={focusV} average={avg} better={better} format={format} />
        </div>
        <p className="mt-2 text-[15px] leading-relaxed text-[#1B5E86]">
          {focusRow && focusV != null && avg != null ? (
            <>
              <strong className="font-bold">{focusRow.name}</strong> : <strong className="font-bold">{format(focusV)}</strong> ({label.toLowerCase()}) en{" "}
              <strong className="font-bold">{year}</strong>, contre une moyenne de <strong className="font-bold">{format(avg)}</strong> pour les départements de métropole.
              {isBetter && (
                <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[#2E9F48]">
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                  <span className="text-[13px] font-semibold">meilleur que la moyenne</span>
                </span>
              )}
            </>
          ) : (
            <>
              Moyenne des départements : <strong className="font-bold">{avg != null ? format(avg) : "—"}</strong>. Cliquez un département pour le situer.
            </>
          )}
        </p>
        <div className="mt-8">
          <ScaleLegend item="Valeur du département" average="Moyenne des départements de métropole" />
        </div>
      </section>

      <NextStep step={1} />
    </div>
  );
}

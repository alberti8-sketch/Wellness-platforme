"use client";

import { GitCompareArrows, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { BAND_META, fmt } from "@/lib/bands";
import type { BandCode, Catalog, Territory } from "@/lib/types";
import { useAnalytics } from "./analytics";
import { FoodPanel, TrendPanel } from "./territory-context-panels";

const TYPE_LABEL: Record<string, string> = { urbain: "Ville", "semi-urbain": "Ville moyenne", rural: "Commune rurale" };

function BandChip({ band }: { band: BandCode | null }) {
  if (!band) {
    return <span className="inline-flex h-[26px] items-center rounded-full bg-[#EFEFEA] px-2.5 text-xs font-semibold text-[#4A4E57]">Pas de données</span>;
  }
  const m = BAND_META[band];
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold" style={{ background: m.tint, color: m.text }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

const barColor = (band: BandCode | null) => (band ? BAND_META[band].color : "#B9B9B2");

export function TerritoryDrawer({
  territory: t,
  rank,
  total,
  catalog,
  weights,
  onClose,
}: {
  territory: Territory;
  rank: number;
  total: number;
  catalog: Catalog;
  weights: Record<string, number>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { compare, toggleCompare, open } = useAnalytics();
  const router = useRouter();
  const inCompare = compare.includes(t.code);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t.code, onClose]);

  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const score = t.composite.score;
  const pos = score == null ? 0 : ((score - 1) / 9) * 100;
  const c = t.context;
  const level = c.level === "commune" ? "Commune" : "Département";

  return (
    <aside
      aria-label={`Fiche détaillée : ${t.name}`}
      className="drawer-in no-print fixed inset-y-0 right-0 z-[1100] flex w-full max-w-[420px] flex-col border-l border-[#E7E7E2] bg-[#F6F6F3] shadow-[-12px_0_32px_rgba(21,23,28,0.10)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-[#E7E7E2] bg-white px-5 py-4">
        <div className="min-w-0">
          <p className="tabular-nums text-[13px] text-[#61656E]">
            {level} {t.code} · Rang {rank} sur {total}
          </p>
          <h2 className="mt-1 truncate text-[22px] font-semibold tracking-[-0.02em] text-[#15171C]">{t.name}</h2>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Fermer la fiche"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#E0E0DA] bg-white text-[#15171C] hover:bg-[#F0F0EB]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Score */}
        <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-[#61656E]">Indice de bien-être</p>
            <BandChip band={t.composite.band} />
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="tabular-nums text-[52px] font-semibold leading-none tracking-[-0.04em] text-[#15171C]">{fmt(score)}</span>
            <span className="text-base text-[#61656E]">/10</span>
          </p>
          <div className="relative mt-5">
            <div className="flex h-2 overflow-hidden rounded-full">
              <span className="flex-[3] bg-[#F6D3C8]" />
              <span className="flex-[3] bg-[#F1E4BF]" />
              <span className="flex-[3] bg-[#C6E4DA]" />
            </div>
            {score != null && (
              <span
                className="absolute -top-1 h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-white bg-[#15171C] shadow-[0_1px_4px_rgba(21,23,28,0.3)]"
                style={{ left: `${pos}%` }}
                aria-hidden
              />
            )}
            <div className="mt-2 flex justify-between tabular-nums text-[11px] text-[#61656E]">
              <span>1</span>
              <span>4</span>
              <span>7</span>
              <span>10</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#61656E]">Couverture des données : {Math.round(t.composite.coverage * 100)} % du poids demandé</p>

          <h3 className="mt-6 text-[13px] font-semibold text-[#15171C]">Scores par dimension</h3>
          {catalog.dimensions.map((d) => {
            const s = t.dimensions[d.code];
            const w = Math.round(((weights[d.code] ?? 0) / totalW) * 100);
            return (
              <div key={d.code} className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
                <span className="text-sm text-[#15171C]">
                  {d.label} <span className="text-xs text-[#61656E]">· {d.is_outcome ? "résultat" : `${w} %`}</span>
                </span>
                <span className="tabular-nums text-sm font-semibold text-[#15171C]">{s?.score != null ? fmt(s.score) : "—"}</span>
                <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[#EEEEE9]">
                  <div className="h-full rounded-full" style={{ width: `${s?.score != null ? (s.score / 10) * 100 : 0}%`, background: barColor(s?.band ?? null) }} />
                </div>
              </div>
            );
          })}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (inCompare) {
                  toggleCompare(t.code);
                  return;
                }
                toggleCompare(t.code);
                open(null);
                router.push("/classement#comparaison");
              }}
              aria-pressed={inCompare}
              className={`inline-flex h-11 flex-[1_1_140px] items-center justify-center gap-2 rounded-xl text-sm font-medium ${inCompare ? "border border-[#15171C] bg-white text-[#15171C]" : "bg-[#15171C] text-white hover:bg-[#2B2E35]"}`}
            >
              <GitCompareArrows className="h-4 w-4" aria-hidden />
              {inCompare ? "Retirer de la comparaison" : "Comparer"}
            </button>
            <Link href="/ponderation" className="inline-flex h-11 flex-[1_1_140px] items-center justify-center rounded-xl border border-[#E0E0DA] bg-white text-sm font-medium text-[#15171C] hover:bg-[#F0F0EB]">
              Voir le calcul
            </Link>
          </div>
        </section>

        {/* Context */}
        <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
          <h3 className="text-[15px] font-semibold text-[#15171C]">Contexte</h3>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {[
              ["Typologie", c.territory_type ? TYPE_LABEL[c.territory_type] ?? c.territory_type : "—"],
              ["Population", c.population != null ? `${fmt(c.population, 0)} hab.` : "—"],
              ["Densité", c.density_km2 != null ? `${fmt(c.density_km2, 0)} hab/km²` : "—"],
              ["Score global source", c.source_global_score != null ? `${fmt(c.source_global_score, 0)} /100` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#F6F6F3] p-3">
                <p className="text-xs text-[#61656E]">{k}</p>
                <p className="mt-1 tabular-nums text-base font-semibold text-[#15171C]">{v}</p>
              </div>
            ))}
          </div>
        </section>

        <TrendPanel code={t.code} />
        <FoodPanel code={t.code} />

        {/* Indicators */}
        <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-[#15171C]">Indicateurs</h3>
            <span className="text-xs text-[#61656E]">Valeur brute · score</span>
          </div>
          {catalog.dimensions.map((d) => {
            const items = catalog.indicators.filter((i) => i.dimension === d.code);
            if (!items.length) return null;
            return (
              <div key={d.code}>
                <p className="mb-1 mt-4 text-xs font-semibold text-[#61656E]">{d.label}</p>
                {items.map((i) => {
                  const cell = t.indicators[i.code];
                  const missing = cell?.raw_value == null;
                  return (
                    <div key={i.code} className="flex items-center gap-2.5 border-b border-[#F2F2EE] py-2 last:border-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: barColor(cell?.band ?? null) }} aria-hidden />
                      <span className="min-w-0 flex-1 text-[13px] leading-snug text-[#15171C]">{i.label}</span>
                      <span className={`shrink-0 tabular-nums text-[13px] ${missing ? "italic text-[#7A7E87]" : "text-[#3A3D44]"}`}>
                        {missing ? "Manquant" : `${fmt(cell!.raw_value, 1)} ${i.unit}`}
                      </span>
                      <span className="w-9 shrink-0 text-right tabular-nums text-[13px] font-semibold text-[#15171C]">{cell?.score != null ? fmt(cell.score) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </section>
      </div>
    </aside>
  );
}

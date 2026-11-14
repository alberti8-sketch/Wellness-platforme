"use client";

import { NextStep } from "@/components/next-step";
import { Check, GitCompareArrows, Map as MapIcon, PanelRight, SlidersHorizontal, Utensils } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { CityPicker } from "@/components/city-picker";
import { ScaleBar, ScaleLegend, seqColor } from "@/components/scale-bar";
import { useSession } from "@/components/session";
import type { MapValue } from "@/components/territory-map";
import { BandLegend, Card, Empty, PageHeader, Spinner, cx } from "@/components/ui";
import { BAND_META, NO_DATA_COLOR, fmt } from "@/lib/bands";
import { useFood } from "@/lib/context-data";
import { useTerritoryShapes } from "@/lib/geo";
import { TYPE_LABEL, mean, metricKey, metricLabel, metricValue, parseMetric, type Metric } from "@/lib/metrics";
import type { BandCode, TerritoryType } from "@/lib/types";

const TerritoryMap = dynamic(() => import("@/components/territory-map"), { ssr: false, loading: () => <Spinner label="Chargement de la carte…" /> });

export default function CartePage() {
  const { catalog } = useSession();
  const { territories, overview, ttype, setTtype, selected, open, compare, toggleCompare } = useAnalytics();
  const [metric, setMetric] = useState<Metric>({ kind: "composite" });
  const [view, setView] = useState<"map" | "chart">("map");
  const [bandFilter, setBandFilter] = useState<BandCode | "all">("all");
  const [compareMode, setCompareMode] = useState(false);
  const [showFood, setShowFood] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Shareable city view: /carte?ville=35238
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("ville");
      if (v) setFocus(v.toUpperCase());
    } catch {
      /* no URL access */
    }
  }, []);
  const router = useRouter();

  const visible = useMemo(
    () => territories.filter((t) => bandFilter === "all" || metricValue(t, metric).band === bandFilter),
    [territories, bandFilter, metric],
  );
  const { departements, shapes } = useTerritoryShapes(visible.map((t) => t.code));
  const food = useFood(showFood ? visible.map((t) => t.code) : [], true);
  const foodPoints = useMemo(
    () => (showFood && food.data ? Object.values(food.data.territories).flatMap((t) => t.points ?? []) : []),
    [showFood, food.data],
  );

  if (!catalog) return <Spinner />;
  const label = metricLabel(metric, catalog);
  const ind = metric.kind === "ind" ? catalog.indicators.find((i) => i.code === metric.code) : undefined;

  // Displayed value: the raw value for an indicator (its own unit), the 1–10 score otherwise.
  const shown = (t: (typeof visible)[number]) => (ind ? t.indicators[ind.code]?.raw_value ?? null : metricValue(t, metric).score);
  const unit = ind ? (ind.unit.startsWith("%") || ind.unit === "%" ? " %" : ` ${ind.unit}`) : "";
  const format = (v: number) => `${fmt(v, 1)}${unit}`;
  const nums = visible.map(shown).filter((v): v is number => v != null);
  const lo = nums.length ? Math.floor(Math.min(...nums)) : 0;
  const hi = nums.length ? Math.ceil(Math.max(...nums)) : 10;
  const [dmin, dmax] = lo === hi ? [lo - 1, hi + 1] : [lo, hi];
  const avg = mean(nums);
  const better: "low" | "high" = ind && ind.direction === "lower_is_better" ? "low" : "high";
  const focusT = focus ? visible.find((t) => t.code === focus) ?? null : null;
  const focusV = focusT ? shown(focusT) : null;
  const isBetter = focusV != null && avg != null && (better === "high" ? focusV > avg : focusV < avg);
  const source = ind ? ind.source_hint : `Plateforme Wellness — indice calculé à partir des données publiées (${overview?.period ?? ""})`;

  const mapValues: Record<string, MapValue> = Object.fromEntries(
    visible.map((t) => {
      const v = metricValue(t, metric);
      const x = shown(t);
      return [
        t.code,
        {
          name: t.name,
          score: v.score,
          band: v.band,
          fill: seqColor(x, dmin, dmax),
          display: x == null ? "—" : format(x),
          typeLabel: t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : null,
          population: t.context.population,
        },
      ];
    }),
  );
  const onPick = (code: string) => (compareMode ? toggleCompare(code) : setFocus((f) => (f === code ? null : code)));
  const sorted = [...visible].sort((a, b) => (metricValue(b, metric).score ?? -1) - (metricValue(a, metric).score ?? -1));

  return (
    <div>
      <PageHeader
        title="Carte des villes"
        subtitle="Cliquez une ville pour zoomer et la situer par rapport aux autres."
        actions={
          <div className="seg" role="group" aria-label="Mode d'affichage">
            <button aria-pressed={view === "map"} onClick={() => setView("map")}>
              Carte
            </button>
            <button aria-pressed={view === "chart"} onClick={() => setView("chart")}>
              Graphique
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="mb-4 rounded-card border border-hairline bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <label className="flex items-center gap-2 text-[13px] text-ink-muted">
          Indicateur
          <select className="input h-10 w-auto min-w-[240px]" value={metricKey(metric)} onChange={(e) => setMetric(parseMetric(e.target.value))}>
            <option value="composite">Indice de bien-être (pondéré)</option>
            <optgroup label="Dimensions">
              {catalog.dimensions.map((d) => (
                <option key={d.code} value={`dim:${d.code}`}>
                  {d.label}
                </option>
              ))}
            </optgroup>
            {catalog.dimensions.map((d) => (
              <optgroup key={d.code} label={`${d.label} — indicateurs`}>
                {catalog.indicators
                  .filter((i) => i.dimension === d.code)
                  .map((i) => (
                    <option key={i.code} value={`ind:${i.code}`}>
                      {i.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <CityPicker onValidate={(codes) => codes.length > 1 && router.push("/classement#comparaison")} />
        {(() => {
          const active = (ttype ? 1 : 0) + (bandFilter !== "all" ? 1 : 0) + (showFood ? 1 : 0) + (compareMode ? 1 : 0);
          return (
            <button onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className={cx(moreOpen ? "pill-on" : "pill", "ml-auto")}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtres{active ? ` · ${active}` : ""}
            </button>
          );
        })()}
      </div>
      {moreOpen && (
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-hairline pt-3">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Typologie">
          {(["", ...catalog.territory_types] as (TerritoryType | "")[]).map((t) => (
            <button key={t || "all"} className={ttype === t ? "pill-on" : "pill"} aria-pressed={ttype === t} onClick={() => setTtype(t)}>
              {t ? TYPE_LABEL[t] : "Toutes"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Niveau">
          {(["all", "best", "middle", "bad"] as const).map((b) => (
            <button key={b} className={bandFilter === b ? "pill-on" : "pill"} aria-pressed={bandFilter === b} onClick={() => setBandFilter(b)}>
              {b !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: BAND_META[b].color }} aria-hidden />}
              {b === "all" ? "Tous niveaux" : BAND_META[b].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowFood((v) => !v)}
          aria-pressed={showFood}
          className={showFood ? "pill-on" : "pill"}
          title="Afficher les fast-foods et snacks recensés dans OpenStreetMap"
        >
          <Utensils className="h-4 w-4" aria-hidden />
          Fast-food {showFood && food.loading ? "…" : showFood && food.data ? `· ${foodPoints.length}` : ""}
        </button>
        <button
          onClick={() => setCompareMode((v) => !v)}
          aria-pressed={compareMode}
          className={compareMode ? "pill-on" : "pill"}
          title="En mode comparaison, cliquer une ville l'ajoute à la comparaison au lieu d'ouvrir sa fiche"
        >
          <GitCompareArrows className="h-4 w-4" aria-hidden />
          Mode comparaison {compare.length ? `· ${compare.length}` : ""}
        </button>
      </div>
      )}
      </div>

      {!overview ? (
        <Spinner />
      ) : territories.length === 0 ? (
        <Card>
          <Empty icon={MapIcon} title="Aucune donnée publiée pour ce compte">
            Lancez <code>python -m scripts.seed_demo</code> dans <code>backend/</code>, ou déposez puis validez un fichier (Collecte → Traitement).
          </Empty>
        </Card>
      ) : view === "map" ? (
        <section className="rounded-card border border-hairline bg-white p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[24px] font-bold tracking-[-0.02em] text-[#14285A] md:text-[28px]">
                {label} {focusT ? `à ${focusT.name}` : "en France"}
              </h2>
              <p className="mt-2 text-[13px] text-ink-2">
                <strong className="font-semibold text-ink">Source :</strong> {source}
              </p>
            </div>
            {focusT && (
              <div className="flex flex-wrap gap-2">
                <button className="secondary-btn h-10" onClick={() => setFocus(null)}>
                  Vue France
                </button>
                <button className="primary-btn h-10" onClick={() => open(focusT.code)}>
                  <PanelRight className="h-4 w-4" aria-hidden /> Fiche détaillée
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 h-[600px]">
            {shapes ? (
              <TerritoryMap
                departements={departements}
                shapes={shapes}
                values={mapValues}
                selected={focus}
                compared={compare}
                onSelect={onPick}
                metricLabel={label}
                foodPoints={foodPoints}
                focus={focus}
              />
            ) : (
              <Spinner />
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {compareMode ? "Mode comparaison : cliquez les villes à comparer (4 max)." : "Cliquez une ville pour zoomer et la situer par rapport à la moyenne."}
            {showFood && (
              <>
                {" "}
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-ink" aria-hidden /> Fast-food / snack
                </span>{" "}
                — {food.data?.source ?? "OpenStreetMap"} ; recensement collaboratif, exhaustivité variable.
                {food.loading && " Chargement (premier appel ~30 s par grande ville)…"}
              </>
            )}
          </p>

          <div className="mt-8">
            <ScaleBar min={dmin} max={dmax} value={focusV} average={avg} better={better} format={format} />
          </div>
          <p className="mt-2 text-[15px] leading-relaxed text-[#1B5E86]">
            {focusT && focusV != null && avg != null ? (
              <>
                <strong className="font-bold">{focusT.name}</strong> {ind ? "a une valeur de" : "a un score de"} <strong className="font-bold">{format(focusV)}</strong>
                {ind ? ` pour « ${label.toLowerCase()} »` : ""} en <strong className="font-bold">{overview?.period}</strong>, contre une moyenne de{" "}
                <strong className="font-bold">{format(avg)}</strong> pour les villes du tableau de bord.
                {isBetter && (
                  <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[#2E9F48]">
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                    <span className="text-[13px] font-semibold">meilleur que la moyenne</span>
                  </span>
                )}
              </>
            ) : (
              <>
                Moyenne des villes du tableau de bord : <strong className="font-bold">{avg != null ? format(avg) : "—"}</strong>. Cliquez une ville sur la carte pour la situer.
              </>
            )}
          </p>
          <div className="mt-8">
            <ScaleLegend />
          </div>
        </section>
      ) : (
        <Card title={label} subtitle="Classement sur l'échelle 1–10 · repères Middle (4) et Best (7)" actions={<BandLegend />}>
          <ol className="space-y-1.5">
            {sorted.map((t) => {
              const v = metricValue(t, metric);
              const inCmp = compare.includes(t.code);
              return (
                <li key={t.code}>
                  <button
                    onClick={() => onPick(t.code)}
                    className={cx("grid w-full grid-cols-[minmax(120px,200px)_1fr_48px] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-plane", inCmp && "ring-2 ring-inset ring-primary")}
                    aria-label={`${t.name} : ${fmt(v.score)} sur 10`}
                  >
                    <span className="truncate text-sm text-ink">{t.name}</span>
                    <span className="relative h-3 rounded-full bg-[#EEEEE9]">
                      <span className="absolute inset-y-0 left-[33.3%] border-l border-dashed border-[#E9AE98]" aria-hidden />
                      <span className="absolute inset-y-0 left-[66.6%] border-l border-dashed border-[#8CC5B5]" aria-hidden />
                      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${((v.score ?? 0) / 10) * 100}%`, background: v.band ? BAND_META[v.band].color : NO_DATA_COLOR }} />
                    </span>
                    <span className="num text-right text-sm font-semibold text-ink">{fmt(v.score)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
      <NextStep step={1} />
    </div>
  );
}

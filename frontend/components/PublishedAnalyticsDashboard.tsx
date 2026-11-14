"use client";

import { FileDown, Map as MapIcon, Printer, RotateCcw, SlidersHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSession } from "@/components/session";
import { BandBadge, BandLegend, Button, Card, Empty, ErrorBox, Spinner, cx } from "@/components/ui";
import type { MapValue } from "@/components/territory-map";
import { api, download } from "@/lib/api";
import { BAND_META, BAND_ORDER, NO_DATA_COLOR, bandOf, fmt } from "@/lib/bands";
import { useTerritoryShapes } from "@/lib/geo";
import type { BandCode, Catalog, DimensionScore, Overview, Territory, TerritoryType } from "@/lib/types";

const TerritoryMap = dynamic(() => import("@/components/territory-map"), { ssr: false, loading: () => <Spinner label="Chargement de la carte…" /> });

type Metric = { kind: "composite" } | { kind: "dim"; code: string } | { kind: "ind"; code: string };

const metricKey = (m: Metric) => (m.kind === "composite" ? "composite" : `${m.kind}:${m.code}`);
function parseMetric(k: string): Metric {
  if (k === "composite") return { kind: "composite" };
  const [kind, code] = k.split(":");
  return { kind: kind as "dim" | "ind", code };
}

function metricLabel(m: Metric, catalog: Catalog) {
  if (m.kind === "composite") return "Indice bien-être global";
  if (m.kind === "dim") return catalog.dimensions.find((d) => d.code === m.code)?.label ?? m.code;
  return catalog.indicators.find((i) => i.code === m.code)?.label ?? m.code;
}

function metricValue(t: Territory, m: Metric): DimensionScore & { raw?: number | null } {
  if (m.kind === "composite") return t.composite;
  if (m.kind === "dim") return t.dimensions[m.code] ?? { score: null, band: null, coverage: 0 };
  const c = t.indicators[m.code];
  return { score: c?.score ?? null, band: c?.band ?? null, coverage: c?.score != null ? 1 : 0, raw: c?.raw_value ?? null };
}

const weightsParam = (w: Record<string, number>) =>
  Object.entries(w)
    .map(([k, v]) => `${k}:${v}`)
    .join(",");

export default function PublishedAnalyticsDashboard() {
  const { ready, catalog, apiKey } = useSession();
  const [ttype, setTtype] = useState<TerritoryType | "">("");
  const [weights, setWeights] = useState<Record<string, number> | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>({ kind: "composite" });
  const [filter, setFilter] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);

  const defaults = useMemo(() => (catalog ? Object.fromEntries(catalog.dimensions.map((d) => [d.code, d.default_weight])) : null), [catalog]);
  useEffect(() => {
    if (defaults) setWeights(defaults);
  }, [defaults]);
  useEffect(() => {
    setFilter(new Set());
    setSelected(null);
    setPeriod(null);
  }, [apiKey]);

  // Debounced fetch: the composite index is recomputed server-side for the chosen weights.
  useEffect(() => {
    if (!ready || !weights) return;
    const t = setTimeout(() => {
      setLoading(true);
      const q = new URLSearchParams({ weights: weightsParam(weights) });
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
    }, 250);
    return () => clearTimeout(t);
  }, [ready, weights, period, apiKey, ttype]);

  const territories = useMemo(() => (overview?.territories ?? []).filter((t) => filter.size === 0 || filter.has(t.code)), [overview, filter]);
  const { departements, shapes } = useTerritoryShapes(territories.map((t) => t.code));
  useEffect(() => {
    if (territories.length && (!selected || !territories.some((t) => t.code === selected))) setSelected(territories[0].code);
  }, [territories, selected]);

  if (!ready || !catalog || !weights) return <Spinner />;

  const label = metricLabel(metric, catalog);
  const mapValues: Record<string, MapValue> = Object.fromEntries(
    territories.map((t) => {
      const v = metricValue(t, metric);
      const ind = metric.kind === "ind" ? catalog.indicators.find((i) => i.code === metric.code) : undefined;
      return [t.code, { name: t.name, score: v.score, band: v.band, detail: ind ? `Valeur brute : ${fmt(v.raw, 2)} ${ind.unit}` : undefined }];
    }),
  );
  const sel = territories.find((t) => t.code === selected) ?? null;
  const counts = BAND_ORDER.map((b) => ({ band: b, n: territories.filter((t) => metricValue(t, metric).band === b).length }));
  const scored = territories.map((t) => metricValue(t, metric).score).filter((s): s is number => s !== null);
  const avg = scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100 : null;

  const exportCsv = () => {
    const q = new URLSearchParams({ weights: weightsParam(weights) });
    if (overview?.period) q.set("period", String(overview.period));
    if (filter.size) q.set("territories", [...filter].join(","));
    if (ttype) q.set("territory_type", ttype);
    void download(`/api/analytics/export.csv?${q}`, "wellness.csv").catch((e: Error) => setError(e.message));
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Tableau de bord territorial</h1>
          <p className="text-sm text-ink-2">Scores de 1 à 10 par territoire, calculés à partir d'indicateurs normalisés et pondérés. Seules les données publiées sont affichées.</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="secondary" icon={FileDown} onClick={exportCsv} disabled={!territories.length}>
            Export CSV
          </Button>
          <Button variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!territories.length}>
            Export PDF
          </Button>
        </div>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      {overview && overview.territories.length === 0 ? (
        <Card>
          <Empty icon={MapIcon} title="Aucune donnée publiée pour ce compte">
            Déposez un fichier sur la page <Link className="text-brand underline" href="/collect">Collecte</Link>, puis approuvez-le dans{" "}
            <Link className="text-brand underline" href="/processing">Traitement</Link>. Données de l'équipe prêtes à l'emploi : <code>data/wp25_communes.xlsx</code>, ou en une commande : <code>python -m scripts.seed_demo</code> dans <code>backend/</code>.
          </Empty>
        </Card>
      ) : !overview ? (
        <Spinner />
      ) : (
        <>
          {/* Filters — one row above the charts */}
          <div className="no-print flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface px-4 py-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-ink-2">Indicateur affiché</span>
              <select className="rounded-md border border-axis bg-white px-2 py-1.5" value={metricKey(metric)} onChange={(e) => setMetric(parseMetric(e.target.value))}>
                <option value="composite">Indice bien-être global (pondéré)</option>
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
            {overview.periods.length > 0 && (
              <label className="flex items-center gap-2">
                <span className="text-ink-2">Année</span>
                <select className="rounded-md border border-axis bg-white px-2 py-1.5" value={overview.period ?? ""} onChange={(e) => setPeriod(Number(e.target.value))}>
                  {overview.periods.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2">
              <span className="text-ink-2">Typologie</span>
              <select
                className="rounded-md border border-axis bg-white px-2 py-1.5"
                value={ttype}
                onChange={(e) => {
                  setTtype(e.target.value as TerritoryType | "");
                  setFilter(new Set());
                }}
              >
                <option value="">Toutes</option>
                {catalog.territory_types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-2">Territoires</span>
              {overview.territories.map((t) => {
                const on = filter.size === 0 || filter.has(t.code);
                return (
                  <button
                    key={t.code}
                    onClick={() => {
                      const next = new Set(filter.size === 0 ? overview.territories.map((x) => x.code) : filter);
                      if (next.has(t.code)) next.delete(t.code);
                      else next.add(t.code);
                      setFilter(next.size === overview.territories.length || next.size === 0 ? new Set() : next);
                    }}
                    className={cx("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-brand bg-brand-50 text-brand" : "border-axis text-ink-muted line-through")}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            {loading && <span className="text-xs text-ink-muted">Recalcul…</span>}
          </div>

          {/* KPI tiles */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile label="Territoires analysés" value={String(territories.length)} sub={`Année ${overview.period ?? "—"}`} />
            <Tile label={`Moyenne · ${label}`} value={fmt(avg)} sub={<BandBadge band={bandOf(avg)} />} />
            {counts.map(({ band, n }) => (
              <Tile key={band} label={`Territoires ${BAND_META[band].label}`} value={String(n)} sub={<span className="text-xs text-ink-muted">score {BAND_META[band].range}</span>} accent={BAND_META[band].color} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card title={`Carte · ${label}`} actions={<BandLegend />}>
              <div className="h-[520px]">
                {shapes ? (
                  <TerritoryMap departements={departements} shapes={shapes} values={mapValues} selected={selected} onSelect={setSelected} metricLabel={label} />
                ) : (
                  <Spinner />
                )}
              </div>
              <p className="mt-2 text-xs text-ink-muted">Cliquez sur un territoire pour afficher son détail. Fond de carte modifiable via l'icône en haut à droite.</p>
            </Card>
            <WeightsPanel catalog={catalog} weights={weights} onChange={setWeights} onReset={() => defaults && setWeights(defaults)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={`Classement · ${label}`}>
              <RankingChart territories={territories} metric={metric} onSelect={setSelected} />
            </Card>
            {sel && <TerritoryDetail t={sel} catalog={catalog} />}
          </div>

          <Card title="Matrice territoires × dimensions">
            <Matrix territories={territories} catalog={catalog} selected={selected} onSelect={setSelected} />
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs text-ink-2">
        {accent && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: accent }} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function WeightsPanel({ catalog, weights, onChange, onReset }: { catalog: Catalog; weights: Record<string, number>; onChange: (w: Record<string, number>) => void; onReset: () => void }) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" /> Pondération de l'indice
        </span>
      }
      actions={<Button variant="ghost" icon={RotateCcw} onClick={onReset} className="no-print text-xs">Défaut</Button>}
      className="h-fit"
    >
      <div className="space-y-4">
        {catalog.dimensions.map((d) => {
          const w = weights[d.code] ?? 0;
          return (
            <label key={d.code} className="block">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink">{d.label}</span>
                <span className="tabular-nums text-ink-2">{total ? Math.round((w / total) * 100) : 0} %</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={w}
                onChange={(e) => onChange({ ...weights, [d.code]: Number(e.target.value) })}
                className="no-print mt-1 w-full accent-[#1f3a5f]"
                aria-label={`Poids ${d.label}`}
              />
              {d.is_outcome && <p className="text-xs text-ink-muted">Indicateur de résultat : exclu par défaut, sert à calibrer les poids.</p>}
            </label>
          );
        })}
        {total === 0 && <p className="text-xs text-band-bad">Tous les poids sont à zéro : l'indice ne peut pas être calculé.</p>}
        <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
          Indice = Σ (poids × score de dimension) / Σ poids. Les dimensions manquantes sont exclues et les poids restants renormalisés.
        </p>
      </div>
    </Card>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; score: number | null; band: BandCode | null; extra?: string } }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-hairline bg-white px-3 py-2 text-xs shadow">
      <p className="font-medium text-ink">{p.name}</p>
      <p className="mt-1 flex items-center gap-2 text-ink-2">
        Score <strong className="tabular-nums text-ink">{fmt(p.score)}</strong> / 10 <BandBadge band={p.band} />
      </p>
      {p.extra && <p className="mt-1 text-ink-muted">{p.extra}</p>}
    </div>
  );
}

function RankingChart({ territories, metric, onSelect }: { territories: Territory[]; metric: Metric; onSelect: (c: string) => void }) {
  const data = territories
    .map((t) => {
      const v = metricValue(t, metric);
      return { code: t.code, name: t.name, score: v.score, band: v.band };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return (
    <div style={{ height: Math.max(180, data.length * 44 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#e1e0d9" />
          <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
          <ReferenceLine x={4} stroke="#c3c2b7" strokeDasharray="3 3" />
          <ReferenceLine x={7} stroke="#c3c2b7" strokeDasharray="3 3" />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f0efec" }} />
          <Bar isAnimationActive={false} dataKey="score" barSize={18} radius={[0, 4, 4, 0]} onClick={(d) => {
              const code = (d as unknown as { code?: string }).code;
              if (code) onSelect(code);
            }} className="cursor-pointer">
            {data.map((d) => (
              <Cell key={d.code} fill={d.band ? BAND_META[d.band].color : NO_DATA_COLOR} />
            ))}
            <LabelList dataKey="score" position="right" formatter={(v: number) => fmt(v)} style={{ fontSize: 12, fill: "#0b0b0b" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TerritoryDetail({ t, catalog }: { t: Territory; catalog: Catalog }) {
  const dimData = catalog.dimensions.map((d) => ({
    code: d.code,
    name: d.label,
    score: t.dimensions[d.code]?.score ?? null,
    band: t.dimensions[d.code]?.band ?? null,
    extra: `Couverture des indicateurs : ${Math.round((t.dimensions[d.code]?.coverage ?? 0) * 100)} %`,
  }));
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {t.name} ({t.code}) <BandBadge band={t.composite.band} score={t.composite.score} size="lg" />
        </span>
      }
    >
      <ContextBlock t={t} />
      <p className="mb-2 text-xs text-ink-2">Score par dimension (1–10). Repères pointillés : seuils Middle (4) et Best (7).</p>
      <div className="h-[200px]">
        <ResponsiveContainer>
          <BarChart data={dimData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="#e1e0d9" />
            <XAxis type="number" domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: "#898781" }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: "#52514e" }} axisLine={false} tickLine={false} />
            <ReferenceLine x={4} stroke="#c3c2b7" strokeDasharray="3 3" />
            <ReferenceLine x={7} stroke="#c3c2b7" strokeDasharray="3 3" />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f0efec" }} />
            <Bar isAnimationActive={false} dataKey="score" barSize={16} radius={[0, 4, 4, 0]}>
              {dimData.map((d) => (
                <Cell key={d.code} fill={d.band ? BAND_META[d.band].color : NO_DATA_COLOR} />
              ))}
              <LabelList dataKey="score" position="right" formatter={(v: number) => fmt(v)} style={{ fontSize: 12, fill: "#0b0b0b" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface text-left text-ink-muted">
            <tr>
              <th className="py-1.5 font-medium">Indicateur</th>
              <th className="py-1.5 text-right font-medium">Valeur</th>
              <th className="w-[38%] py-1.5 pl-3 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {catalog.indicators.map((i) => {
              const c = t.indicators[i.code];
              return (
                <tr key={i.code} className="border-t border-hairline">
                  <td className="py-1.5 pr-2 text-ink-2">
                    {i.label} <span className="text-ink-muted">{i.direction === "higher_is_better" ? "↑" : "↓"}</span>
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-ink">
                    {fmt(c?.raw_value, 2)} <span className="text-ink-muted">{i.unit}</span>
                  </td>
                  <td className="py-1.5 pl-3">
                    {c?.score != null && c.band ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-plane">
                          <div className="h-2 rounded-full" style={{ width: `${(c.score / 10) * 100}%`, background: BAND_META[c.band].color }} />
                        </div>
                        <span className="w-8 text-right tabular-nums text-ink">{fmt(c.score)}</span>
                      </div>
                    ) : (
                      <span className="italic text-ink-muted">non renseigné</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Matrix({ territories, catalog, selected, onSelect }: { territories: Territory[]; catalog: Catalog; selected: string | null; onSelect: (c: string) => void }) {
  const cell = (s: DimensionScore | undefined) =>
    s?.band ? (
      <span className="inline-flex min-w-[3.5rem] items-center justify-center gap-1 rounded-md px-2 py-1 tabular-nums font-medium" style={{ background: BAND_META[s.band].tint, color: BAND_META[s.band].text }}>
        {fmt(s.score)}
      </span>
    ) : (
      <span className="italic text-ink-muted">—</span>
    );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-ink-2">
          <tr>
            <th className="py-2 pr-3 font-medium">Territoire</th>
            <th className="px-2 py-2 font-medium">Typologie</th>
            <th className="px-2 py-2 font-semibold text-ink">Indice global</th>
            {catalog.dimensions.map((d) => (
              <th key={d.code} className="px-2 py-2 font-medium">
                {d.label}
                {d.is_outcome && <span className="block font-normal text-ink-muted">(résultat)</span>}
              </th>
            ))}
            <th className="px-2 py-2 font-medium">Couverture</th>
            <th className="px-2 py-2 font-medium" title="Score global fourni dans le fichier source, sur 100">Score source /100</th>
          </tr>
        </thead>
        <tbody>
          {territories.map((t) => (
            <tr key={t.code} onClick={() => onSelect(t.code)} className={cx("cursor-pointer border-t border-hairline hover:bg-plane", t.code === selected && "bg-brand-50/60")}>
              <td className="py-2 pr-3 font-medium text-ink">
                {t.name} <span className="text-ink-muted">({t.code})</span>
              </td>
              <td className="px-2 py-2 text-ink-2">{t.context.territory_type ?? "—"}</td>
              <td className="px-2 py-2">
                <BandBadge band={t.composite.band} score={t.composite.score} />
              </td>
              {catalog.dimensions.map((d) => (
                <td key={d.code} className="px-2 py-2">
                  {cell(t.dimensions[d.code])}
                </td>
              ))}
              <td className="px-2 py-2 tabular-nums text-ink-2">{Math.round(t.composite.coverage * 100)} %</td>
              <td className="px-2 py-2 tabular-nums text-ink-2">{fmt(t.context.source_global_score, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContextBlock({ t }: { t: Territory }) {
  const c = t.context;
  const items = [
    ["Typologie", c.territory_type ?? "—"],
    ["Population", c.population != null ? `${fmt(c.population, 0)} hab.` : "—"],
    ["Densité", c.density_km2 != null ? `${fmt(c.density_km2, 0)} hab./km²` : "—"],
    ["Score global source", c.source_global_score != null ? `${fmt(c.source_global_score, 0)} / 100` : "—"],
  ];
  return (
    <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-plane px-3 py-2 text-xs sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-ink-muted">{k}</dt>
          <dd className="font-medium tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

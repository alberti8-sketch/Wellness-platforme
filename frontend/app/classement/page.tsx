"use client";

import { NextStep } from "@/components/next-step";
import { GitCompareArrows, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { MAX_COMPARE, useAnalytics } from "@/components/analytics";
import { CityPicker } from "@/components/city-picker";
import { CompareTable, type ExtraRow } from "@/components/compare-table";
import { Pagination } from "@/components/pagination";
import { MedalRank, Podium } from "@/components/podium";
import { useSession } from "@/components/session";
import { BandBadge, Button, Card, Empty, PageHeader, Spinner, cx } from "@/components/ui";
import { BAND_META, fmt } from "@/lib/bands";
import { deptOf } from "@/components/territory-context-panels";
import { trendDelta, useFood, useTrends } from "@/lib/context-data";
import { useDepartementData } from "@/lib/prediction";
import { SERIES, TYPE_LABEL } from "@/lib/metrics";
import type { BandCode, Territory } from "@/lib/types";

type SortKey = "IDX" | string;

export default function ClassementPage() {
  const { catalog } = useSession();
  const { territories, overview, open, compare, clearCompare } = useAnalytics();
  const [q, setQ] = useState("");
  const [band, setBand] = useState<BandCode | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("IDX");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const diab = useTrends(compare, "diabete");
  const depData = useDepartementData();
  const food = useFood(compare);
  const val = (t: Territory, k: SortKey) => (k === "IDX" ? t.composite.score : t.dimensions[k]?.score) ?? null;
  // Ranking on the chosen criterion (best first) over all territories: drives the podium and the « Rang » column.
  const ranked = useMemo(
    () => [...territories].sort((a, b) => (val(b, sortKey) ?? -99) - (val(a, sortKey) ?? -99) || a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [territories, sortKey],
  );
  const rankIn = useMemo(
    () => Object.fromEntries(ranked.map((t, i) => [t.code, val(t, sortKey) == null ? null : i + 1])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranked, sortKey],
  );
  const rows = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    return ranked
      .filter((t) => !q || norm(t.name).includes(norm(q)) || t.code.includes(q))
      .filter((t) => band === "all" || t.composite.band === band);
  }, [ranked, q, band]);
  // Back to the first page whenever the list changes.
  useEffect(() => setPage(1), [q, band, sortKey, pageSize]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = rows.slice((current - 1) * pageSize, current * pageSize);

  if (!catalog) return <Spinner />;

  const shownDims = catalog.dimensions.filter((d) => territories.some((t) => t.dimensions[d.code]?.score != null));
  const criteria: { key: SortKey; label: string }[] = [{ key: "IDX", label: "Indice global" }, ...shownDims.map((d) => ({ key: d.code, label: d.label }))];
  const criterion = criteria.find((c) => c.key === sortKey) ?? criteria[0];
  const podium = ranked
    .filter((t) => val(t, sortKey) != null)
    .slice(0, 3)
    .map((t) => {
      const d = sortKey === "IDX" ? t.composite : t.dimensions[sortKey];
      return { code: t.code, name: t.name, sub: t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : null, score: d?.score ?? null, band: d?.band ?? null };
    });
  const Head = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className={cx("px-2 py-2 text-left font-medium", sortKey === k && "text-ink")} aria-sort={sortKey === k ? "descending" : "none"}>
      {children}
    </th>
  );
  const compared = compare.map((c) => territories.find((t) => t.code === c)).filter((t): t is Territory => !!t);
  const showComparison = () =>
    requestAnimationFrame(() => document.getElementById("comparaison")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const pct = (v: number | null) => (v == null ? "—" : `${fmt(v, 2)} %`);
  const pts = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, 2)} pt`);
  const extra: ExtraRow[] = [];
  for (const [res, name] of [[diab.data, "Diabète"]] as const) {
    if (!res) continue;
    const deltas = compared.map((t) => trendDelta(res.series[t.code]?.points));
    const y0 = deltas.find((d) => d)?.from.year;
    const y1 = deltas.find((d) => d)?.to.year;
    const section = "Diabète (département, Assurance Maladie)";
    extra.push(
      { section, label: `${name} ${y0 ?? ""}`, values: deltas.map((d) => d?.from.prev ?? null), format: pct, better: "low" },
      { section, label: `${name} ${y1 ?? ""}`, values: deltas.map((d) => d?.to.prev ?? null), format: pct, better: "low" },
      { section, label: `Évolution ${name.toLowerCase()}`, values: deltas.map((d) => d?.abs ?? null), format: pts, better: "low" },
    );
  }
  if (depData.data) {
    const rows = compared.map((t) => depData.data!.departements.find((d) => d.code === deptOf(t.code))?.values);
    const section = "Prévention (département, Santé publique France)";
    const score = (v: number | null) => (v == null ? "—" : `${fmt(v, 0)} /100`);
    extra.push(
      { section, label: "Comportement préventif (ICP)", values: rows.map((v) => v?.icp ?? null), format: score, better: "high" },
      { section, label: "Dépistage des cancers", values: rows.map((v) => v?.prev_sub_depistage ?? null), format: score, better: "high" },
      { section, label: "Vaccination", values: rows.map((v) => v?.prev_sub_vaccination ?? null), format: score, better: "high" },
    );
  }
  if (food.data) {
    const f = compared.map((t) => food.data!.territories[t.code]);
    const section = "Environnement alimentaire (OpenStreetMap)";
    extra.push(
      { section, label: "Fast-food / snack pour 10 000 hab.", values: f.map((x) => x?.fast_food_per_10k ?? null), format: (v) => fmt(v, 1), better: "low" },
      { section, label: "Fast-food / snack (nombre)", values: f.map((x) => x?.counts?.fast_food ?? null), format: (v) => fmt(v, 0), better: null },
      { section, label: "Restaurants (nombre)", values: f.map((x) => x?.counts?.restaurant ?? null), format: (v) => fmt(v, 0), better: null },
    );
  }
  const radarData = catalog.dimensions
    .filter((d) => !d.is_outcome)
    .map((d) => ({ dim: d.label, ...Object.fromEntries(compared.map((t) => [t.code, t.dimensions[d.code]?.score ?? 0])) }));

  return (
    <div>
      <PageHeader
        title="Comparer les villes"
        subtitle="Choisissez des villes pour les mettre côte à côte, ou parcourez le classement."
        actions={<CityPicker align="right" onValidate={showComparison} />}
      />

      <div id="comparaison" className="mb-4 scroll-mt-6">
        <Card
          title="Comparaison"
          subtitle={compared.length < 2 ? "Choisissez 2 à 4 villes avec « Villes à comparer », en haut de la page." : `${compared.length} villes comparées`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {compared.length > 0 && (
                <Button variant="secondary" onClick={clearCompare} className="min-h-[40px]">
                  Vider
                </Button>
              )}
            </div>
          }
        >
          {compared.length < 2 ? (
            <Empty icon={GitCompareArrows} title="Comparaison vide">
              Ouvrez « Villes à comparer » en haut de la page, cochez 2 à 4 villes puis validez.
            </Empty>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
              <figure>
                <div className="h-[340px]" role="img" aria-label="Radar des dimensions pour les territoires comparés">
                  <ResponsiveContainer>
                    <RadarChart data={radarData} outerRadius="72%">
                      <PolarGrid stroke="#E7E7E2" />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12, fill: "#4A4E57" }} />
                      <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={{ fontSize: 10, fill: "#7A7E87" }} axisLine={false} />
                      {compared.map((t, i) => (
                        <Radar key={t.code} name={t.name} dataKey={t.code} stroke={SERIES[i]} fill={SERIES[i]} fillOpacity={0.08} strokeWidth={2} isAnimationActive={false} />
                      ))}
                      <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">
                  {compared.map((t, i) => (
                    <span key={t.code} className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} aria-hidden />
                      {t.name}
                    </span>
                  ))}
                </figcaption>
              </figure>
              <div>
                <CompareTable territories={compared} catalog={catalog} colors={SERIES} extra={extra} />
                {(diab.loading || food.loading) && <p className="mt-2 text-xs text-ink-muted">Chargement des séries maladies et de l'environnement alimentaire…</p>}
              </div>
            </div>
          )}
        </Card>
      </div>
      <Card
        title="Classement"
        subtitle={`Selon : ${criterion.label} · cliquez une ville pour ouvrir sa fiche`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Rechercher un territoire</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input className="input h-10 w-56 pl-9" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par niveau">
              {(["all", "best", "middle", "bad"] as const).map((b) => (
                <button key={b} className={band === b ? "pill-on" : "pill"} aria-pressed={band === b} onClick={() => setBand(b)}>
                  {b !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: BAND_META[b].color }} aria-hidden />}
                  {b === "all" ? "Tous" : BAND_META[b].label}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label="Classer selon">
          {criteria.map((c) => (
            <button key={c.key} className={sortKey === c.key ? "pill-on" : "pill"} aria-pressed={sortKey === c.key} onClick={() => setSortKey(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
        {podium.length === 3 && (
          <div className="mx-auto mb-8 max-w-[640px]">
            <Podium entries={podium} onOpen={open} />
          </div>
        )}
        {!overview ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty icon={Search} title="Aucun territoire ne correspond aux filtres" />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="px-2 py-2 text-left font-medium">Rang</th>
                  <th className="px-2 py-2 text-left font-medium">Territoire</th>
                  <Head k="IDX">Indice</Head>
                  {shownDims.map((d) => (
                    <Head key={d.code} k={d.code}>
                      {d.label}
                    </Head>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((t) => {
                  const on = compare.includes(t.code);
                  const r = rankIn[t.code];
                  return (
                    <tr key={t.code} className={cx("border-b border-[#F2F2EE] hover:bg-[#FAFAF7]", on && "bg-[#FAFAF7]")}>
                      <td className="num px-2 py-2.5">
                        {r != null && r <= 3 ? <MedalRank rank={r} /> : <span className="pl-1.5 text-ink-muted">{r ?? "—"}</span>}
                      </td>
                      <td className="px-2 py-2.5">
                        <button onClick={() => open(t.code)} className="text-left font-medium text-ink hover:underline">
                          {t.name}
                        </button>
                        <span className="block text-xs text-ink-muted">{t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : t.code}</span>
                      </td>
                      <td className="px-2 py-2.5">
                        <BandBadge band={t.composite.band} score={t.composite.score} />
                      </td>
                      {shownDims.map((d) => {
                        const s = t.dimensions[d.code];
                        return (
                          <td key={d.code} className="num px-2 py-2.5">
                            {s?.score != null ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full" style={{ background: s.band ? BAND_META[s.band].color : "#B9B9B2" }} aria-hidden />
                                {fmt(s.score)}
                              </span>
                            ) : (
                              <span className="text-ink-faint">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-2">
              <Pagination page={current} pageSize={pageSize} total={rows.length} onPage={setPage} onPageSize={setPageSize} noun="villes" />
            </div>
          </div>
        )}
      </Card>

      <NextStep step={2} />
    </div>
  );
}

"use client";

import { ArrowLeft, ArrowRight, LayoutGrid, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { CitySearch } from "@/components/city-search";
import { DashboardTrends } from "@/components/dashboard-trends";
import { EXTRA_DIMS, ExtraScoresCard, FoodScorePanel, ScreeningPanel, useExtraScores } from "@/components/extra-scores";
import { TrendPanel } from "@/components/territory-context-panels";
import { NextStep } from "@/components/next-step";
import { PageActions } from "@/components/page-actions";
import { useSession } from "@/components/session";
import { BandBadge, Card, Empty, Kpi, PageHeader, ScoreBar, Spinner } from "@/components/ui";
import { BAND_META, BAND_ORDER, bandOf, fmt } from "@/lib/bands";
import { TYPE_LABEL, mean } from "@/lib/metrics";
import type { BandCode, Catalog, Territory } from "@/lib/types";

function Donut({ counts, total }: { counts: Record<BandCode, number>; total: number }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 156 156" className="h-[156px] w-[156px] shrink-0" role="img" aria-label={BAND_ORDER.map((b) => `${BAND_META[b].label} ${counts[b]}`).join(", ")}>
      <circle cx="78" cy="78" r={r} fill="none" stroke="#EEEEE9" strokeWidth="18" />
      {BAND_ORDER.map((b) => {
        const len = total ? (counts[b] / total) * c : 0;
        const seg = (
          <circle
            key={b}
            cx="78"
            cy="78"
            r={r}
            fill="none"
            stroke={BAND_META[b].color}
            strokeWidth="18"
            strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 78 78)"
          />
        );
        offset += len;
        return seg;
      })}
      <text x="78" y="74" textAnchor="middle" className="num fill-[#15171C] text-[26px] font-semibold">
        {total}
      </text>
      <text x="78" y="94" textAnchor="middle" className="fill-[#61656E] text-[11px]">
        villes
      </text>
    </svg>
  );
}

export default function DashboardPage() {
  const { catalog } = useSession();
  const { territories, overview, weights, open, rankOf } = useAnalytics();
  const extra = useExtraScores(territories);
  // Optional single-city view (?ville=<code>), chosen with the search box.
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("ville");
      if (v) setCity(v.toUpperCase());
    } catch {
      /* no URL access */
    }
  }, []);
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (city) url.searchParams.set("ville", city);
      else url.searchParams.delete("ville");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* no URL access */
    }
  }, [city]);

  if (!catalog || !weights) return <Spinner />;
  const cityT = city ? territories.find((t) => t.code === city) ?? null : null;
  const search = <CitySearch territories={territories} value={cityT?.code ?? null} onPick={setCity} />;
  const header = (
    <PageHeader
      title="Vue d'ensemble"
      subtitle={`L'indice de bien-être des villes, noté de 1 à 10 · ${overview?.period ?? ""}`}
      actions={
        <>
          {search}
          <PageActions />
        </>
      }
    />
  );
  if (cityT && overview)
    return (
      <CityOverview
        t={cityT}
        territories={territories}
        catalog={catalog}
        rank={rankOf(cityT.code)}
        extra={extra}
        search={search}
        onBack={() => setCity(null)}
        onOpen={() => open(cityT.code)}
      />
    );
  if (!overview)
    return (
      <>
        {header}
        <Spinner />
      </>
    );
  if (!territories.length)
    return (
      <>
        {header}
        <Card>
          <Empty icon={LayoutGrid} title="Aucune donnée publiée pour ce compte">
            Lancez <code>python -m scripts.seed_demo</code> dans <code>backend/</code>, ou déposez un fichier via « Gérer les données ».
          </Empty>
        </Card>
      </>
    );

  const avg = mean(territories.map((t) => t.composite.score));
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, territories.filter((t) => t.composite.band === b).length])) as Record<BandCode, number>;
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const sorted = [...territories].sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1));
  const top = sorted.slice(0, 3);
  const bottom = sorted.slice(-3).reverse();

  const Row = ({ t, i }: { t: Territory; i: number }) => (
    <li>
      <button onClick={() => open(t.code)} className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-plane">
        <span className="num w-5 text-right text-xs text-ink-muted">{i}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.name}</span>
        <BandBadge band={t.composite.band} score={t.composite.score} />
      </button>
    </li>
  );

  return (
    <div>
      {header}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Indice moyen" value={fmt(avg)} sub={<BandBadge band={bandOf(avg)} />} />
        {BAND_ORDER.map((b) => (
          <Kpi key={b} label={`Villes ${BAND_META[b].label}`} value={counts[b]} sub={`indice ${BAND_META[b].range}`} accent={BAND_META[b].color} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Scores par dimension"
          subtitle="Moyenne des villes, de 1 à 10"
          actions={
            <Link href="/ponderation" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
              Comment l'indice est calculé <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        >
          <div className="space-y-4">
            {catalog.dimensions
              .filter((d) => !d.is_outcome)
              .map((d) => {
                const m = mean(territories.map((t) => t.dimensions[d.code]?.score));
                const b = bandOf(m);
                return (
                  <div key={d.code}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-sm text-ink">
                        {d.label} <span className="text-xs text-ink-muted">· {Math.round(((weights[d.code] ?? 0) / totalW) * 100)} %</span>
                      </span>
                      <span className="num text-sm font-semibold text-ink">{m == null ? "—" : fmt(m)}</span>
                    </div>
                    <ScoreBar score={m} color={b ? BAND_META[b].color : "#B9B9B2"} height={8} />
                  </div>
                );
              })}
            {EXTRA_DIMS.map((d) => {
              const m = mean(territories.map((t) => extra[d.key][t.code]));
              const b = bandOf(m);
              return (
                <div key={d.key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">
                      {d.label} <span className="text-xs text-ink-muted">· hors indice</span>
                    </span>
                    <span className="num text-sm font-semibold text-ink">{m == null ? "—" : fmt(m)}</span>
                  </div>
                  <ScoreBar score={m} color={b ? BAND_META[b].color : "#B9B9B2"} height={8} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Répartition par niveau" subtitle="Combien de villes dans chaque niveau">
          <div className="flex flex-wrap items-center gap-6">
            <Donut counts={counts} total={territories.length} />
            <ul className="min-w-[120px] flex-1 space-y-3">
              {BAND_ORDER.map((b) => (
                <li key={b} className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink" title={`Indice ${BAND_META[b].range}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_META[b].color }} aria-hidden />
                    {BAND_META[b].label}
                  </span>
                  <span className="num font-semibold text-ink">{counts[b]}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card title="Les extrêmes" subtitle="Cliquez une ville pour sa fiche">
          <p className="mb-1 text-xs font-semibold text-ink-muted">Meilleurs indices</p>
          <ol>
            {top.map((t, i) => (
              <Row key={t.code} t={t} i={i + 1} />
            ))}
          </ol>
          <p className="mb-1 mt-4 text-xs font-semibold text-ink-muted">Plus faibles indices</p>
          <ol>
            {bottom.map((t, i) => (
              <Row key={t.code} t={t} i={sorted.length - i} />
            ))}
          </ol>
        </Card>
      </div>

      <ExtraScoresCard territories={territories} onPick={setCity} />
      <DashboardTrends />
      <NextStep step={0} />
    </div>
  );
}

/** Overview of one city: its index, rank and gap to the average, its dimensions against the average, health context. */
function CityOverview({
  t,
  territories,
  catalog,
  rank,
  extra,
  search,
  onBack,
  onOpen,
}: {
  t: Territory;
  territories: Territory[];
  catalog: Catalog;
  rank: number;
  extra: ReturnType<typeof useExtraScores>;
  search: React.ReactNode;
  onBack: () => void;
  onOpen: () => void;
}) {
  const avg = mean(territories.map((x) => x.composite.score));
  const score = t.composite.score;
  const gap = score != null && avg != null ? score - avg : null;
  const dims = catalog.dimensions.filter((d) => !d.is_outcome && t.dimensions[d.code]?.score != null);
  const ordered = [...dims].sort((a, b) => (t.dimensions[b.code].score ?? 0) - (t.dimensions[a.code].score ?? 0));
  const best = ordered[0];
  const worst = ordered[ordered.length - 1];
  const sub = [t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : null, t.context.population ? `${fmt(t.context.population, 0)} hab.` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title={t.name}
        subtitle={sub || undefined}
        actions={
          <>
            {search}
            <button onClick={onBack} className="secondary-btn h-10">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Toutes les villes
            </button>
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Indice de bien-être" value={fmt(score)} sub={<BandBadge band={t.composite.band} />} />
        <Kpi label="Rang" value={rank ? `${rank}ᵉ` : "—"} sub={`sur ${territories.length} villes suivies`} />
        <Kpi
          label="Écart à la moyenne"
          value={gap == null ? "—" : `${gap > 0 ? "+" : gap < 0 ? "−" : ""}${fmt(Math.abs(gap))}`}
          sub={avg == null ? undefined : `moyenne des villes : ${fmt(avg)}`}
        />
        <Kpi
          label="Point fort"
          value={best ? fmt(t.dimensions[best.code].score) : "—"}
          sub={best ? `${best.label}${worst && worst.code !== best.code ? ` · à améliorer : ${worst.label}` : ""}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Scores par dimension"
          subtitle="La ville (barre) face à la moyenne des villes (trait)"
          actions={
            <button onClick={onOpen} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
              Fiche complète <PanelRightOpen className="h-3.5 w-3.5" aria-hidden />
            </button>
          }
        >
          <div className="space-y-4">
            {[
              ...dims.map((d) => ({ key: d.code, label: d.label, note: null as string | null, v: t.dimensions[d.code].score, m: mean(territories.map((x) => x.dimensions[d.code]?.score)) })),
              ...EXTRA_DIMS.map((d) => ({ key: d.key, label: d.label, note: "hors indice", v: extra[d.key][t.code], m: mean(territories.map((x) => extra[d.key][x.code])) })),
            ].map(({ key, label, note, v, m }) => {
              const b = bandOf(v);
              return (
                <div key={key}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">
                      {label}
                      {note && <span className="text-xs text-ink-muted"> · {note}</span>}
                    </span>
                    <span className="text-sm">
                      <span className="num font-semibold text-ink">{fmt(v)}</span>
                      {m != null && <span className="text-xs text-ink-muted"> · moy. {fmt(m)}</span>}
                    </span>
                  </div>
                  <div className="relative">
                    <ScoreBar score={v} color={b ? BAND_META[b].color : "#B9B9B2"} height={8} />
                    {m != null && (
                      <span className="absolute -top-1 h-4 w-0.5 rounded bg-ink" style={{ left: `calc(${(m / 10) * 100}% - 1px)` }} aria-hidden />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <TrendPanel code={t.code} />
        <FoodScorePanel code={t.code} />
        <ScreeningPanel code={t.code} />
      </div>
      <NextStep step={0} />
    </div>
  );
}

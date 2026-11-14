"use client";

import { ArrowRight, LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useAnalytics } from "@/components/analytics";
import { DashboardTrends } from "@/components/dashboard-trends";
import { NextStep } from "@/components/next-step";
import { PageActions } from "@/components/page-actions";
import { useSession } from "@/components/session";
import { BandBadge, Card, Empty, Kpi, PageHeader, ScoreBar, Spinner } from "@/components/ui";
import { BAND_META, BAND_ORDER, bandOf, fmt } from "@/lib/bands";
import { mean } from "@/lib/metrics";
import type { BandCode, Territory } from "@/lib/types";

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
  const { territories, overview, weights, open } = useAnalytics();

  if (!catalog || !weights) return <Spinner />;
  const header = (
    <PageHeader title="Vue d'ensemble" subtitle={`L'indice de bien-être des villes, noté de 1 à 10 · ${overview?.period ?? ""}`} actions={<PageActions />} />
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

      <DashboardTrends />
      <NextStep step={0} />
    </div>
  );
}

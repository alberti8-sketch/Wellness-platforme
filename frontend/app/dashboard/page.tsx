"use client";

import { LayoutGrid } from "lucide-react";
import Link from "next/link";
import { useAnalytics } from "@/components/analytics";
import { DashboardTrends } from "@/components/dashboard-trends";
import { PageActions } from "@/components/page-actions";
import { useSession } from "@/components/session";
import { BandBadge, Card, Empty, Kpi, PageHeader, ScoreBar, Spinner } from "@/components/ui";
import { BAND_META, BAND_ORDER, bandOf, fmt } from "@/lib/bands";
import { DIM_COLOR, TYPE_LABEL, mean } from "@/lib/metrics";
import type { BandCode, Territory } from "@/lib/types";

const TYPE_PLURAL: Record<string, string> = { urbain: "Villes", "semi-urbain": "Villes moyennes", rural: "Communes rurales" };

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
        territoires
      </text>
    </svg>
  );
}

export default function DashboardPage() {
  const { catalog } = useSession();
  const { territories, overview, weights, open } = useAnalytics();

  if (!catalog || !weights) return <Spinner />;
  const header = (
    <PageHeader
      title="Tableau de bord"
      subtitle={`Synthèse de l'indice de bien-être territorial, noté de 1 à 10 · ${territories.length} territoires · ${overview?.period ?? ""}`}
      actions={<PageActions />}
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
            Lancez <code>python -m scripts.seed_demo</code> dans <code>backend/</code>, ou déposez puis validez un fichier (Collecte → Traitement).
          </Empty>
        </Card>
      </>
    );

  const avg = mean(territories.map((t) => t.composite.score));
  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, territories.filter((t) => t.composite.band === b).length])) as Record<BandCode, number>;
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  const sorted = [...territories].sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1));
  const top = sorted.slice(0, 5);
  const bottom = sorted.slice(-5).reverse();
  const bins = Array.from({ length: 9 }, (_, i) => ({
    from: i + 1,
    n: territories.filter((t) => t.composite.score != null && t.composite.score >= i + 1 && (i === 8 ? t.composite.score <= 10 : t.composite.score < i + 2)).length,
  }));
  const maxBin = Math.max(1, ...bins.map((b) => b.n));
  const types = catalog.territory_types.map((ty) => {
    const ts = territories.filter((t) => t.context.territory_type === ty);
    return { ty, n: ts.length, avg: mean(ts.map((t) => t.composite.score)) };
  });
  const dimsCov = catalog.dimensions.map((d) => ({ d, n: territories.filter((t) => t.dimensions[d.code]?.score != null).length }));
  const covAvg = mean(territories.map((t) => t.composite.coverage * 100));

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

      <h2 className="sr-only">Indicateurs clés</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Indice moyen" value={fmt(avg)} sub={<BandBadge band={bandOf(avg)} />} />
        <Kpi
          label="Territoires analysés"
          value={territories.length}
          sub={types
            .filter((x) => x.n)
            .map((x) => `${x.n} ${(x.n > 1 ? TYPE_PLURAL : TYPE_LABEL)[x.ty].toLowerCase()}`)
            .join(" · ")}
        />
        {BAND_ORDER.map((b) => (
          <Kpi key={b} label={`Territoires ${BAND_META[b].label}`} value={counts[b]} sub={`indice ${BAND_META[b].range}`} accent={BAND_META[b].color} />
        ))}
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <Card title="Scores moyens par dimension" subtitle="Moyenne des territoires, échelle 1–10">
          <div className="space-y-4">
            {catalog.dimensions.map((d) => {
              const m = mean(territories.map((t) => t.dimensions[d.code]?.score));
              const b = bandOf(m);
              return (
                <div key={d.code}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">
                      {d.label} <span className="text-xs text-ink-muted">· {d.is_outcome ? "résultat" : `${Math.round(((weights[d.code] ?? 0) / totalW) * 100)} %`}</span>
                    </span>
                    <span className="num text-sm font-semibold text-ink">{m == null ? "—" : fmt(m)}</span>
                  </div>
                  <ScoreBar score={m} color={b ? BAND_META[b].color : "#B9B9B2"} height={8} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Répartition par niveau" subtitle="Part des territoires selon leur indice">
          <div className="flex flex-wrap items-center gap-6">
            <Donut counts={counts} total={territories.length} />
            <ul className="min-w-[140px] flex-1 space-y-3">
              {BAND_ORDER.map((b) => (
                <li key={b} className="flex items-center justify-between gap-3 text-sm">
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink" title={`Indice ${BAND_META[b].range}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_META[b].color }} aria-hidden />
                    {BAND_META[b].label}
                  </span>
                  <span className="num whitespace-nowrap font-semibold text-ink">
                    {counts[b]} <span className="text-xs font-normal text-ink-muted">({Math.round((counts[b] / territories.length) * 100)} %)</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card
          title="Pondération active"
          subtitle="Part de chaque dimension dans l'indice"
          actions={
            <Link href="/ponderation" className="secondary-btn h-9 text-[13px]">
              Modifier
            </Link>
          }
        >
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-[#EEEEE9]" role="img" aria-label="Répartition des poids">
            {catalog.dimensions.map((d) =>
              weights[d.code] ? <span key={d.code} style={{ flex: weights[d.code], background: DIM_COLOR[d.code] }} className="border-r-2 border-white last:border-r-0" /> : null,
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {catalog.dimensions.map((d) => (
              <li key={d.code} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIM_COLOR[d.code] }} aria-hidden />
                  {d.label}
                </span>
                <span className="num text-ink-2">{Math.round(((weights[d.code] ?? 0) / totalW) * 100)} %</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Distribution des indices" subtitle="Nombre de territoires par tranche d'indice">
          <div className="flex h-[150px] items-end gap-1.5 border-b border-axis" role="img" aria-label={bins.map((b) => `${b.from}–${b.from + 1} : ${b.n}`).join(", ")}>
            {bins.map((b) => {
              const band = bandOf(b.from + 0.5)!;
              return (
                <div key={b.from} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  {b.n > 0 && <span className="num text-[11px] text-ink-2">{b.n}</span>}
                  <div className="w-full rounded-t-[4px]" style={{ height: `${(b.n / maxBin) * 80}%`, minHeight: b.n ? 4 : 0, background: BAND_META[band].color }} />
                </div>
              );
            })}
          </div>
          <div className="num mt-1.5 flex gap-1.5 text-[11px] text-ink-muted">
            {bins.map((b) => (
              <span key={b.from} className="flex-1 text-center">
                {b.from}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Par typologie" subtitle="Comparer des territoires de même type (PONDERATION 3)">
          <ul className="space-y-4">
            {types.map(({ ty, n, avg: a }) => (
              <li key={ty}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {TYPE_LABEL[ty]} <span className="text-xs text-ink-muted">· {n} territoire(s)</span>
                  </span>
                  <span className="num font-semibold text-ink">{a == null ? "—" : fmt(a)}</span>
                </div>
                <ScoreBar score={a} color={a != null ? BAND_META[bandOf(a)!].color : "#B9B9B2"} height={8} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Extrêmes du classement" subtitle="Cliquez un territoire pour ouvrir sa fiche">
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold text-ink-muted">Meilleurs indices</p>
              <ol>
                {top.map((t, i) => (
                  <Row key={t.code} t={t} i={i + 1} />
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-ink-muted">Plus faibles indices</p>
              <ol>
                {bottom.map((t, i) => (
                  <Row key={t.code} t={t} i={sorted.length - i} />
                ))}
              </ol>
            </div>
          </div>
        </Card>

        <Card title="Couverture des données" subtitle={`Couverture moyenne du poids demandé : ${fmt(covAvg, 0)} %`}>
          <ul className="space-y-2.5 text-sm">
            {dimsCov.map(({ d, n }) => (
              <li key={d.code} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIM_COLOR[d.code] }} aria-hidden />
                  {d.label}
                </span>
                <span className={`num ${n < territories.length ? "text-[#9A2F1C]" : "text-ink-2"}`}>
                  {n}/{territories.length}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-muted">Une dimension manquante est exclue de l'indice du territoire, et les autres poids sont renormalisés.</p>
        </Card>
      </div>

      <DashboardTrends />
    </div>
  );
}

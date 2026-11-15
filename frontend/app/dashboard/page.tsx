"use client";

import { ArrowRight, ChevronRight, LayoutGrid, Lightbulb, PanelRightOpen, Target, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { DashboardTrends } from "@/components/dashboard-trends";
import { EXTRA_DIMS, ExtraScoresCard, ScreeningPanel, useExtraScores } from "@/components/extra-scores";
import { DiseasesModal } from "@/components/diseases-modal";
import { ComparisonCard, DIMENSION_DETERMINANT, DimensionDrawer, DiseasesSummary, LandCard, ReportActions, UnmeasuredNote } from "@/components/report-blocks";
import { PageActions } from "@/components/page-actions";
import { useSession } from "@/components/session";
import { BandBadge, Card, Empty, Kpi, PageHeader, ScoreBar, Spinner } from "@/components/ui";
import { BAND_META, BAND_ORDER, bandOf, fmt } from "@/lib/bands";
import { TYPE_LABEL, mean } from "@/lib/metrics";
import { PageCover } from "@/components/page-cover";
import { CITY_COVERS } from "@/lib/covers";
import { useReport } from "@/lib/rapport";
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
  const { catalog, account, authReady } = useSession();
  const { territories, overview, weights, open } = useAnalytics();
  const extra = useExtraScores(territories);
  // Optional single-city view (?ville=<code>): the account's commune, a link, or a click in the tables.
  const [city, setCity] = useState<string | null>(null);
  // Default: the ?ville= of the URL, else the signed-in account's commune (once: « Toutes les villes » stays possible).
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current) return;
    let v: string | null = null;
    try {
      v = new URLSearchParams(window.location.search).get("ville");
    } catch {
      /* no URL access */
    }
    if (v) {
      setCity(v.toUpperCase());
      defaulted.current = true;
    } else if (account) {
      setCity(account.city_code);
      defaulted.current = true;
    } else if (authReady) {
      defaulted.current = true;
    }
  }, [account, authReady]);
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
  const header = (
    <PageHeader
      title="Vue d'ensemble"
      subtitle={`Le score des villes, noté de 1 à 10 · ${overview?.period ?? ""}`}
      actions={<PageActions />}
    />
  );
  if (cityT && overview)
    return (
      <CityOverview
        t={cityT}
        territories={territories}
        catalog={catalog}
        mine={account?.city_code === cityT.code}
        extra={extra}
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
    </div>
  );
}

/** Overview of one city: its index and gap to the average, its dimensions against the average, health context. */
function CityOverview({
  t,
  territories,
  catalog,
  mine,
  extra,
  onOpen,
}: {
  t: Territory;
  territories: Territory[];
  catalog: Catalog;
  mine: boolean;
  extra: ReturnType<typeof useExtraScores>;
  onOpen: () => void;
}) {
  const avg = mean(territories.map((x) => x.composite.score));
  const score = t.composite.score;
  const gap = score != null && avg != null ? score - avg : null;
  const dims = catalog.dimensions.filter((d) => !d.is_outcome && t.dimensions[d.code]?.score != null);
  const ordered = [...dims].sort((a, b) => (t.dimensions[b.code].score ?? 0) - (t.dimensions[a.code].score ?? 0));
  const best = ordered[0];
  const worst = ordered[ordered.length - 1];
  const dimAvg = (code: string) => mean(territories.map((x) => x.dimensions[code]?.score ?? null).filter((v): v is number => v != null));
  const report = useReport(t.code);
  // Diseases pop-in: opened from « Toutes les maladies », and right after signing in (?maladies=1).
  const [showDiseases, setShowDiseases] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("maladies") === "1") setShowDiseases(true);
    } catch {
      /* no URL access */
    }
  }, []);
  const closeDiseases = useCallback(() => {
    setShowDiseases(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("maladies");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* no URL access */
    }
  }, []);
  const sub = ["Rapport de la commune", mine ? "votre commune" : null, t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : null, t.context.population ? `${fmt(t.context.population, 0)} hab.` : null]
    .filter(Boolean)
    .join(" · ");

  const cover = CITY_COVERS[t.code];
  return (
    // With a cover photo, the content starts 120 px from the top of the page (28 px of page padding + 92 px).
    <div className={cover ? "pt-[92px]" : undefined}>
      {cover && <PageCover url={cover} />}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">Vue d'ensemble</p>
          <h1 className="mt-1 text-[44px] font-bold leading-none tracking-[-0.03em] text-ink">{t.name}</h1>
          {sub && <p className="mt-2.5 text-sm text-ink-muted">{sub}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportActions code={t.code} name={t.name} />
        </div>
      </header>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* The score, the most important figure, with its gap to the average of the cities inside. */}
        <div className="rounded-card border border-hairline bg-white p-6">
          <p className="text-[14px] font-medium text-ink-muted">Score</p>
          <p className="num mt-2 leading-none tracking-[-0.03em] text-ink">
            <span className="text-[64px] font-bold">{fmt(score)}</span>
            <span className="ml-1 text-[20px] font-semibold text-ink-muted">/10</span>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <BandBadge band={t.composite.band} />
            {gap != null && avg != null && (
              <span
                className="num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold"
                style={gap >= 0 ? { background: "#DDF0EA", color: "#0E5A50" } : { background: "#FBE6DF", color: "#9A2F1C" }}
              >
                <span className="text-[11px]" aria-hidden>
                  {gap >= 0 ? "▲" : "▼"}
                </span>
                {gap > 0 ? "+" : gap < 0 ? "−" : ""}
                {fmt(Math.abs(gap))} vs la moyenne des villes ({fmt(avg)})
              </span>
            )}
          </div>
        </div>
        {/* What to improve first: the weakest dimension, highlighted. */}
        <div className="rounded-card border-2 border-[#E7B9A9] bg-[#FDF3EF] p-5">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[#9A2F1C]">
            <Target className="h-4 w-4" aria-hidden /> À améliorer en priorité
          </p>
          <p className="mt-2 text-[22px] font-bold leading-tight text-ink">{worst?.label ?? "—"}</p>
          {worst && (
            <>
              <p className="num mt-1.5 text-[13px] text-ink-2">
                <strong className="text-[#9A2F1C]">{fmt(t.dimensions[worst.code].score)}</strong> /10 · moyenne des villes {fmt(dimAvg(worst.code))}
              </p>
              <Link
                href={`/assistant?ville=${t.code}&question=${encodeURIComponent(
                  `Comment améliorer le score « ${worst.label} » de ${t.name} ? Il est de ${fmt(t.dimensions[worst.code].score)} /10 contre ${fmt(
                    dimAvg(worst.code),
                  )} en moyenne pour les villes suivies. Propose des actions concrètes que la mairie peut lancer.`,
                )}`}
                className="no-print mt-3 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#9A2F1C] px-3 text-[13px] font-semibold text-white hover:bg-[#7E2615]"
              >
                <Lightbulb className="h-4 w-4" aria-hidden /> Trouver une solution
              </Link>
            </>
          )}
        </div>
        <div className="rounded-card border border-hairline bg-white p-5">
          <p className="flex items-center gap-1.5 text-[14px] font-semibold text-[#0E5A50]">
            <ThumbsUp className="h-4 w-4" aria-hidden /> Point fort
          </p>
          <p className="mt-2 text-[22px] font-bold leading-tight text-ink">{best?.label ?? "—"}</p>
          {best && (
            <p className="num mt-1.5 text-[13px] text-ink-2">
              <strong className="text-[#0E5A50]">{fmt(t.dimensions[best.code].score)}</strong> /10 · moyenne des villes {fmt(dimAvg(best.code))}
            </p>
          )}
        </div>
      </div>


      <div className="mb-4">
        {report.data && showDiseases && <DiseasesModal report={report.data} onClose={closeDiseases} />}
        {report.data ? <DiseasesSummary report={report.data} onShowAll={() => setShowDiseases(true)} /> : <Card title="Maladies chroniques">{report.error ?? "Chargement…"}</Card>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <Card
          title="Scores par dimension"
          subtitle="La ville (barre) face à la moyenne des villes (trait) · cliquez une ligne pour le détail"
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
              const det = DIMENSION_DETERMINANT[key];
              const row = (
                <>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-sm text-ink">
                      {report.data && det && <ChevronRight className="h-4 w-4 text-ink-muted transition group-open:rotate-90" aria-hidden />}
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
                </>
              );
              // Each line is a drawer: the health determinant behind the score, its indicators and the diseases linked to it.
              return report.data && det ? (
                <details key={key} className="group">
                  <summary className="cursor-pointer list-none rounded-lg [&::-webkit-details-marker]:hidden">{row}</summary>
                  <DimensionDrawer report={report.data} determinant={det} only={key === "screening" ? ["prev_sub_depistage"] : undefined} />
                </details>
              ) : (
                <div key={key}>{row}</div>
              );
            })}
          </div>
          {report.data && <UnmeasuredNote report={report.data} />}
        </Card>
        <ScreeningPanel code={t.code} />
        {report.data && <LandCard report={report.data} className="lg:col-span-2" />}
        {report.data && (
          <div className="lg:col-span-2">
            <ComparisonCard report={report.data} />
          </div>
        )}
      </div>
    </div>
  );
}

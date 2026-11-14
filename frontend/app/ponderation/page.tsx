"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { PageActions } from "@/components/page-actions";
import { useSession } from "@/components/session";
import { BandBadge, Card, PageHeader, Spinner } from "@/components/ui";
import { BasisBadge, WeightSources } from "@/components/weight-sources";
import { api } from "@/lib/api";
import { fmt } from "@/lib/bands";
import { DIM_COLOR } from "@/lib/metrics";
import type { Overview } from "@/lib/types";

export default function PonderationPage() {
  const { catalog } = useSession();
  const { weights, setWeights, defaults, territories, isCustom, rankOf, overview } = useAnalytics();
  const [base, setBase] = useState<Overview | null>(null);

  // Reference ranking with the default weights, to show the impact of the current weighting.
  useEffect(() => {
    if (!defaults || !overview) return;
    const q = new URLSearchParams({
      weights: Object.entries(defaults)
        .map(([k, v]) => `${k}:${v}`)
        .join(","),
    });
    if (overview.period) q.set("period", String(overview.period));
    api
      .get<Overview>(`/api/analytics/overview?${q}`)
      .then(setBase)
      .catch(() => setBase(null));
  }, [defaults, overview]);

  if (!catalog || !weights) return <Spinner />;
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const baseRank: Record<string, number> = {};
  [...(base?.territories ?? [])]
    .sort((a, b) => (b.composite.score ?? -1) - (a.composite.score ?? -1))
    .forEach((t, i) => (baseRank[t.code] = i + 1));
  const impact = [...territories]
    .map((t) => ({ t, now: rankOf(t.code), before: baseRank[t.code] ?? rankOf(t.code), baseScore: base?.territories.find((b) => b.code === t.code)?.composite.score ?? null }))
    .sort((a, b) => a.now - b.now);

  return (
    <div>
      <PageHeader title="Pondération & méthode" subtitle="Ajustez le poids de chaque dimension : l'indice et le classement se recalculent en direct" actions={<PageActions exports={false} />} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Pondération des dimensions" subtitle="Les poids sont relatifs : seule leur proportion compte.">
          {/* Stacked share of the weights */}
          <div className="mb-5 flex h-3 overflow-hidden rounded-full bg-[#EEEEE9]" role="img" aria-label="Répartition des poids">
            {catalog.dimensions.map((d) =>
              weights[d.code] ? <span key={d.code} style={{ flex: weights[d.code], background: DIM_COLOR[d.code] }} className="border-r-2 border-white last:border-r-0" /> : null,
            )}
          </div>
          <div className="space-y-5">
            {catalog.dimensions.map((d) => {
              const w = weights[d.code] ?? 0;
              return (
                <div key={d.code}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: DIM_COLOR[d.code] }} aria-hidden />
                      {d.label}
                      <BasisBadge basis={d.weight_basis.basis} />
                    </span>
                    <span className="num shrink-0 whitespace-nowrap text-sm text-ink-2">
                      {w} <span className="text-ink-muted">· {total ? Math.round((w / total) * 100) : 0} %</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={w}
                    onChange={(e) => setWeights({ ...weights, [d.code]: Number(e.target.value) })}
                    className="mt-1 h-7 w-full"
                    aria-label={`Poids ${d.label}`}
                  />
                  <p className="text-xs text-ink-muted">{d.description}</p>
                </div>
              );
            })}
          </div>
          {total === 0 && <p className="mt-3 text-xs text-danger">Tous les poids sont à zéro : l'indice ne peut pas être calculé.</p>}
        </Card>

        <Card title="Impact sur le classement" subtitle={isCustom ? "Rang avec votre pondération, comparé à la pondération par défaut (PONDERATION 3)." : "Modifiez un poids pour voir les territoires monter ou descendre."}>
          {!base ? (
            <Spinner />
          ) : (
            <ol className="divide-y divide-[#F2F2EE]">
              {impact.map(({ t, now, before, baseScore }) => {
                const d = before - now;
                return (
                  <li key={t.code} className="flex items-center gap-3 py-2">
                    <span className="num w-6 text-right text-sm text-ink-muted">{now}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.name}</span>
                    <span className="num text-xs text-ink-muted" title="Indice avec la pondération par défaut">
                      {fmt(baseScore)} →
                    </span>
                    <BandBadge band={t.composite.band} score={t.composite.score} />
                    <span
                      className={`num inline-flex w-14 items-center justify-end gap-0.5 text-xs font-semibold ${d > 0 ? "text-[#0E5A50]" : d < 0 ? "text-[#9A2F1C]" : "text-ink-muted"}`}
                      aria-label={d === 0 ? "rang inchangé" : `${d > 0 ? "gagne" : "perd"} ${Math.abs(d)} place(s)`}
                    >
                      {d > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : d < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      {d !== 0 ? Math.abs(d) : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Méthode de calcul">
          <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-ink-2">
            <li>
              <strong className="text-ink">Normalisation</strong> : chaque valeur brute est ramenée sur 1–10 par rapport à une plage de référence fixe (seuils OMS,
              références nationales), inversée si « plus bas = mieux », bornée à [1, 10].
            </li>
            <li>
              <strong className="text-ink">Dimension</strong> : moyenne pondérée des indicateurs disponibles ; publiée seulement si au moins 50 % des indicateurs sont présents.
            </li>
            <li>
              <strong className="text-ink">Indice</strong> : Σ (poids × score de dimension) / Σ poids. Les dimensions manquantes sont exclues et les poids restants
              renormalisés ; la couverture est affichée dans chaque fiche.
            </li>
            <li>
              <strong className="text-ink">Niveaux</strong> : Bad &lt; 4 ≤ Middle &lt; 7 ≤ Best.
            </li>
          </ol>
          <p className="mt-4 rounded-xl bg-plane px-3 py-2 text-xs text-ink-2">
            Les maladies chroniques sont un indicateur de résultat : affichées, exclues de l'indice par défaut, elles servent à calibrer les poids.
          </p>
        </Card>

        <Card title="Catalogue des indicateurs" subtitle={`${catalog.indicators.length} indicateurs · ${catalog.dimensions.length} dimensions`}>
          <div className="-mx-1 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="px-1 py-2 text-left font-medium">Indicateur</th>
                  <th className="px-1 py-2 text-left font-medium">Sens</th>
                  <th className="px-1 py-2 text-right font-medium">Référence</th>
                </tr>
              </thead>
              <tbody>
                {catalog.indicators.map((i) => (
                  <tr key={i.code} className="border-b border-[#F2F2EE] align-top">
                    <td className="px-1 py-2">
                      <span className="flex items-center gap-2 text-ink">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIM_COLOR[i.dimension] }} aria-hidden />
                        {i.label}
                      </span>
                      <span className="block pl-4 text-xs text-ink-muted">{i.source_hint}</span>
                    </td>
                    <td className="whitespace-nowrap px-1 py-2 text-ink-2">{i.direction === "higher_is_better" ? "↑ plus haut = mieux" : "↓ plus bas = mieux"}</td>
                    <td className="num whitespace-nowrap px-1 py-2 text-right text-ink-2">
                      {i.ref_min}–{i.ref_max} {i.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <WeightSources catalog={catalog} />
      </div>
    </div>
  );
}

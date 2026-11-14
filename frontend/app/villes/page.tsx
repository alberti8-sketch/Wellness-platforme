"use client";

import { Building2 } from "lucide-react";
import { useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { useSession } from "@/components/session";
import { BandBadge, Card, Empty, PageHeader, Spinner } from "@/components/ui";
import { fmt } from "@/lib/bands";
import { DIM_COLOR, TYPE_LABEL } from "@/lib/metrics";
import type { TerritoryType } from "@/lib/types";

// WP25 source scores, on their original 0–100 scale.
const SOURCE = [
  { code: "sport_score", label: "Sport", color: DIM_COLOR.SPORT },
  { code: "env_score", label: "Environnement", color: DIM_COLOR.ENV },
  { code: "health_care_score", label: "Offre de soins", color: DIM_COLOR.HEALTH },
];

export default function VillesPage() {
  const { catalog } = useSession();
  const { territories, overview, open } = useAnalytics();
  const [type, setType] = useState<TerritoryType | "all">("all");
  if (!catalog) return <Spinner />;

  const rows = territories
    .filter((t) => type === "all" || t.context.territory_type === type)
    .sort((a, b) => (b.context.source_global_score ?? -1) - (a.context.source_global_score ?? -1));

  return (
    <div>
      <PageHeader title="Villes WP25" subtitle="Scores de référence Sport, Environnement et Offre de soins, sur l'échelle source 0–100 (classeur WP25)" />
      <Card
        title="Classement des villes"
        subtitle="Trié par score global source. L'indice de la plateforme (1–10) est recalculé à partir de ces scores et de la pondération."
        actions={
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type de commune">
            {(["all", ...catalog.territory_types] as (TerritoryType | "all")[]).map((t) => (
              <button key={t} className={type === t ? "pill-on" : "pill"} aria-pressed={type === t} onClick={() => setType(t)}>
                {t === "all" ? "Toutes" : TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        }
      >
        {!overview ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty icon={Building2} title="Aucune ville publiée" />
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs text-ink-muted">
                <tr className="border-b border-hairline">
                  <th className="px-2 py-2 text-left font-medium">Ville</th>
                  <th className="px-2 py-2 text-right font-medium">Score global /100</th>
                  {SOURCE.map((s) => (
                    <th key={s.code} className="min-w-[150px] px-2 py-2 text-left font-medium">
                      {s.label}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left font-medium">Indice plateforme</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.code} className="border-b border-[#F2F2EE] hover:bg-[#FAFAF7]">
                    <td className="px-2 py-2.5">
                      <button onClick={() => open(t.code)} className="text-left font-medium text-ink hover:underline">
                        {t.name}
                      </button>
                      <span className="block text-xs text-ink-muted">
                        {t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : ""} · {t.context.population != null ? `${fmt(t.context.population, 0)} hab.` : t.code}
                      </span>
                    </td>
                    <td className="num px-2 py-2.5 text-right text-base font-semibold text-ink">{fmt(t.context.source_global_score, 0)}</td>
                    {SOURCE.map((s) => {
                      const v = t.indicators[s.code]?.raw_value ?? null;
                      return (
                        <td key={s.code} className="px-2 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEEEE9]">
                              <div className="h-full rounded-full" style={{ width: `${v ?? 0}%`, background: s.color }} />
                            </div>
                            <span className="num w-8 text-right text-ink-2">{v == null ? "—" : fmt(v, 0)}</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2.5">
                      <BandBadge band={t.composite.band} score={t.composite.score} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

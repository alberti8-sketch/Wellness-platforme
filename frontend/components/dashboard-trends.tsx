"use client";

import { useState } from "react";
import { fmt } from "@/lib/bands";
import { trendDelta, useTrends } from "@/lib/context-data";
import { useAnalytics } from "./analytics";
import { Card, Spinner } from "./ui";

/** Diabetes trend by city (data.ameli.fr, department level). */
export function DashboardTrends() {
  const { territories, open } = useAnalytics();
  const codes = territories.map((t) => t.code);
  const diab = useTrends(codes, "diabete");
  const [all, setAll] = useState(false);

  if (!territories.length) return null;

  const rows = territories
    .map((t) => ({ t, d: trendDelta(diab.data?.series[t.code]?.points), dept: diab.data?.series[t.code]?.departement }))
    .filter((r) => r.d)
    .sort((a, b) => b.d!.abs - a.d!.abs);
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.d!.abs)));
  const y0 = rows[0]?.d?.from.year;
  const y1 = rows[0]?.d?.to.year;

  return (
    <div className="mt-4">
      <Card
        title={`Évolution du diabète${y0 ? ` · ${y0} → ${y1}` : ""}`}
        subtitle="Variation de la prévalence dans le département de chaque territoire (Assurance Maladie). Une hausse est défavorable."
      >
        {diab.loading && !diab.data ? (
          <Spinner label="Chargement des séries…" />
        ) : !rows.length ? (
          <p className="text-sm text-ink-muted">Séries indisponibles{diab.error ? ` : ${diab.error}` : ""}.</p>
        ) : (
          <ol className="space-y-1">
            {(all ? rows : rows.slice(0, 5)).map(({ t, d, dept }) => (
              <li key={t.code}>
                <button onClick={() => open(t.code)} className="grid w-full grid-cols-[minmax(110px,1fr)_minmax(80px,1.4fr)_auto] items-center gap-3 rounded-lg px-1 py-1.5 text-left hover:bg-plane">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {t.name} <span className="text-xs text-ink-muted">({dept})</span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-[#EEEEE9]">
                    <span className="block h-full rounded-full" style={{ width: `${(Math.abs(d!.abs) / maxAbs) * 100}%`, background: d!.abs > 0 ? "#C8513A" : "#1F8A78" }} />
                  </span>
                  <span className="num whitespace-nowrap text-right text-xs">
                    <span className={`font-semibold ${d!.abs > 0 ? "text-[#9A2F1C]" : "text-[#0E5A50]"}`}>
                      {d!.abs > 0 ? "+" : ""}
                      {fmt(d!.abs, 2)} pt
                    </span>{" "}
                    <span className="text-ink-muted">
                      {fmt(d!.from.prev, 1)} → {fmt(d!.to.prev, 1)} %
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {rows.length > 5 && (
          <button onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] font-medium text-ink hover:underline">
            {all ? "Afficher moins" : `Voir les ${rows.length} villes`}
          </button>
        )}
        {diab.data && !diab.data.obesity_available && (
          <p className="mt-3 rounded-xl bg-plane px-3 py-2 text-xs text-ink-2">
            Obésité : pas de série annuelle publique (non suivie par l'Assurance Maladie). Le diabète, très lié à l'obésité, et la densité de fast-foods servent d'indicateurs indirects.
          </p>
        )}
      </Card>

    </div>
  );
}

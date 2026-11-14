"use client";

import { useState } from "react";
import { CartesianGrid, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { fmt } from "@/lib/bands";
import { SMALL_POPULATION, trendDelta, useFood, useTrends } from "@/lib/context-data";
import { useAnalytics } from "./analytics";
import { Card, Spinner } from "./ui";

type XKey = "sport" | "food";

/** Disease trends (data.ameli.fr, department level) and behaviour × disease scatter (WP25 « page 2 »). */
export function DashboardTrends() {
  const { territories, open } = useAnalytics();
  const codes = territories.map((t) => t.code);
  const diab = useTrends(codes, "diabete");
  const food = useFood(codes);
  const [x, setX] = useState<XKey>("sport");

  if (!territories.length) return null;

  const rows = territories
    .map((t) => ({ t, d: trendDelta(diab.data?.series[t.code]?.points), dept: diab.data?.series[t.code]?.departement }))
    .filter((r) => r.d)
    .sort((a, b) => b.d!.abs - a.d!.abs);
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.d!.abs)));
  const y0 = rows[0]?.d?.from.year;
  const y1 = rows[0]?.d?.to.year;

  const points = territories
    .map((t) => {
      const d = trendDelta(diab.data?.series[t.code]?.points);
      const f = food.data?.territories[t.code];
      const xv = x === "sport" ? t.dimensions.SPORT?.score ?? null : f?.population != null && f.population >= SMALL_POPULATION ? f.fast_food_per_10k : null;
      return d && xv != null ? { code: t.code, name: t.name, x: xv, y: d.to.prev } : null;
    })
    .filter((p): p is { code: string; name: string; x: number; y: number } => !!p);
  const excludedSmall = x === "food" ? territories.filter((t) => (food.data?.territories[t.code]?.population ?? Infinity) < SMALL_POPULATION).length : 0;

  return (
    <div className="mt-4 grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
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
            {rows.map(({ t, d, dept }) => (
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
        {diab.data && !diab.data.obesity_available && (
          <p className="mt-3 rounded-xl bg-plane px-3 py-2 text-xs text-ink-2">
            Obésité : pas de série annuelle publique (non suivie par l'Assurance Maladie). Le diabète, très lié à l'obésité, et la densité de fast-foods servent d'indicateurs indirects.
          </p>
        )}
      </Card>

      <Card
        title={x === "sport" ? "Sport × diabète" : "Fast-food × diabète"}
        subtitle={`Prévalence du diabète ${y1 ?? ""} (département) selon ${x === "sport" ? "le score Sport du territoire (1–10)" : "la densité de fast-foods (pour 10 000 hab.)"}`}
        actions={
          <div className="seg" role="group" aria-label="Variable en abscisse">
            <button aria-pressed={x === "sport"} onClick={() => setX("sport")}>
              Sport
            </button>
            <button aria-pressed={x === "food"} onClick={() => setX("food")}>
              Fast-food
            </button>
          </div>
        }
      >
        {(diab.loading && !diab.data) || (x === "food" && food.loading && !food.data) ? (
          <Spinner label="Chargement…" />
        ) : points.length < 2 ? (
          <p className="text-sm text-ink-muted">Pas assez de données pour tracer le nuage.</p>
        ) : (
          <>
            <div className="h-[280px]" role="img" aria-label={`Nuage de points : ${points.map((p) => `${p.name} ${fmt(p.x)} ; ${fmt(p.y, 2)} %`).join(", ")}`}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 12, right: 24, bottom: 18, left: 0 }}>
                  <CartesianGrid stroke="#EEEEE9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={x === "sport" ? "Score Sport" : "Fast-food / 10k hab."}
                    domain={x === "sport" ? [0, 10] : ["auto", "auto"]}
                    tick={{ fontSize: 11, fill: "#61656E" }}
                    axisLine={{ stroke: "#CFCFC8" }}
                    tickLine={false}
                    label={{ value: x === "sport" ? "Score Sport (1–10)" : "Fast-food pour 10 000 hab.", position: "insideBottom", offset: -10, fontSize: 11, fill: "#61656E" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Diabète"
                    domain={["auto", "auto"]}
                    tick={{ fontSize: 11, fill: "#61656E" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${fmt(v, 1)} %`}
                    width={52}
                  />
                  <ZAxis range={[90, 90]} />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ payload }) => {
                      const p = payload?.[0]?.payload as { name: string; x: number; y: number } | undefined;
                      if (!p) return null;
                      return (
                        <div className="rounded-xl border border-hairline bg-white px-3 py-2 text-xs shadow">
                          <p className="font-semibold text-ink">{p.name}</p>
                          <p className="text-ink-2">
                            {x === "sport" ? "Sport" : "Fast-food / 10k"} : <span className="num font-semibold">{fmt(p.x, 1)}</span>
                          </p>
                          <p className="text-ink-2">
                            Diabète : <span className="num font-semibold">{fmt(p.y, 2)} %</span>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={points} fill="#3E63DD" stroke="#FFFFFF" strokeWidth={1.5} isAnimationActive={false} onClick={(p: { code?: string }) => p.code && open(p.code)} className="cursor-pointer">
                    <LabelList dataKey="name" position="right" style={{ fontSize: 10, fill: "#4A4E57" }} />
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              Lecture exploratoire, pas une causalité : la prévalence est départementale et le nombre de points est faible.
              {excludedSmall > 0 && ` ${excludedSmall} petite(s) commune(s) (< ${fmt(SMALL_POPULATION, 0)} hab.) exclue(s) : ratio instable.`}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

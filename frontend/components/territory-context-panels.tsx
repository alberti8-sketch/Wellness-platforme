"use client";

import { ArrowUpRight, Info } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "@/lib/bands";
import { PATHO_LABEL, SMALL_POPULATION, trendDelta, useFood, useTrends, type PathoKey } from "@/lib/context-data";
import { useDepartementData } from "@/lib/prediction";


/** Department prevalence 2015 → latest year (data.ameli.fr). Lower is better: a rise is shown as a worsening. */
export function TrendPanel({ code }: { code: string }) {
  const patho: PathoKey = "diabete"; // diabetes is the single disease kept as an example
  const { data, loading, error } = useTrends([code], patho);
  const s = data?.series[code];
  const d = trendDelta(s?.points);

  return (
    <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[#15171C]">Évolution du diabète</h3>
        <span className="text-xs text-[#61656E]">{s?.departement ? `Département ${s.departement}` : "Département"}</span>
      </div>

      {loading && !data ? (
        <p className="mt-4 text-sm text-[#61656E]">Chargement de la série…</p>
      ) : error || s?.error || !s?.points.length ? (
        <p className="mt-4 text-sm text-[#61656E]">Série indisponible{s?.error ? ` : ${s.error}` : error ? ` : ${error}` : ""}.</p>
      ) : (
        <>
          {d && (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[28px] font-semibold leading-none tracking-[-0.03em] text-[#15171C]">{fmt(d.to.prev, 2)} %</span>
              <span className="text-xs text-[#61656E]">en {d.to.year}</span>
              <span className={`num inline-flex items-center gap-0.5 text-xs font-semibold ${d.abs > 0 ? "text-[#9A2F1C]" : "text-[#0E5A50]"}`}>
                <ArrowUpRight className={`h-3.5 w-3.5 ${d.abs > 0 ? "" : "rotate-90"}`} aria-hidden />
                {d.abs > 0 ? "+" : ""}
                {fmt(d.abs, 2)} pt depuis {d.from.year}
                {d.rel != null && ` (${d.rel > 0 ? "+" : ""}${fmt(d.rel * 100, 0)} %)`}
              </span>
            </p>
          )}
          <div className="mt-3 h-[150px]" role="img" aria-label={`${PATHO_LABEL[patho]} : prévalence de ${fmt(d?.from.prev, 2)} % en ${d?.from.year} à ${fmt(d?.to.prev, 2)} % en ${d?.to.year}`}>
            <ResponsiveContainer>
              <LineChart data={s.points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EEEEE9" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#61656E" }} axisLine={{ stroke: "#CFCFC8" }} tickLine={false} interval="preserveStartEnd" />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "#61656E" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmt(v, 1)} />
                <Tooltip formatter={(v: number) => [`${fmt(v, 2)} %`, "Prévalence"]} labelFormatter={(y) => `Année ${y}`} />
                <Line type="monotone" dataKey="prev" stroke="#3E63DD" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      {data && (
        <p className="mt-3 flex gap-1.5 rounded-xl bg-[#F6F6F3] px-3 py-2 text-xs leading-relaxed text-[#4A4E57]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {data.source}, prévalence tous âges du département (pas de la commune).{" "}
            {!data.obesity_available && "L'obésité n'est pas suivie par l'Assurance Maladie : le diabète et la densité de fast-foods servent d'indicateurs indirects."}
          </span>
        </p>
      )}
    </section>
  );
}

/** OpenStreetMap food outlets (fast food = obesity-related food environment). */
export function FoodPanel({ code }: { code: string }) {
  const isCommune = code.length === 5;
  const { data, loading, error } = useFood(isCommune ? [code] : []);
  const f = data?.territories[code];

  return (
    <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[#15171C]">Environnement alimentaire</h3>
        <span className="text-xs text-[#61656E]">OpenStreetMap</span>
      </div>
      {!isCommune ? (
        <p className="mt-3 text-sm text-[#61656E]">Disponible à l'échelle de la commune uniquement.</p>
      ) : loading && !data ? (
        <p className="mt-3 text-sm text-[#61656E]">Recensement en cours (le premier chargement d'une ville peut prendre ~30 s)…</p>
      ) : error || f?.error || !f?.counts ? (
        <p className="mt-3 text-sm text-[#61656E]">Données indisponibles{f?.error ? ` : ${f.error}` : error ? ` : ${error}` : ""}.</p>
      ) : (
        <>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <span className="num text-[28px] font-semibold leading-none tracking-[-0.03em] text-[#15171C]">{fmt(f.fast_food_per_10k, 1)}</span>
            <span className="text-xs text-[#61656E]">fast-foods / snacks pour 10 000 hab.</span>
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Fast-food", f.counts.fast_food],
              ["Restaurants", f.counts.restaurant],
              ["Cafés", f.counts.cafe],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#F6F6F3] p-2.5">
                <p className="text-[11px] text-[#61656E]">{k}</p>
                <p className="num mt-0.5 text-base font-semibold text-[#15171C]">{fmt(v as number, 0)}</p>
              </div>
            ))}
          </div>
          {f.population != null && f.population < SMALL_POPULATION && (
            <p className="mt-3 rounded-xl bg-[#F6EDD3] px-3 py-2 text-xs text-[#6E5110]">
              Petite commune ({fmt(f.population, 0)} hab.) : quelques établissements suffisent à faire varier fortement le ratio (tourisme, saisonnalité).
            </p>
          )}
          <p className="mt-3 text-xs text-[#61656E]">{data?.note} Affichez les points sur la carte avec la couche « Fast-food ».</p>
        </>
      )}
    </section>
  );
}

const RATES: [string, string][] = [
  ["depistage_sein", "Dépistage cancer du sein"],
  ["depistage_colorectal", "Dépistage cancer colorectal"],
  ["depistage_col", "Dépistage col de l'utérus"],
  ["vacc_grippe65", "Vaccination grippe 65 ans +"],
  ["vacc_hpv", "Vaccination HPV (filles)"],
  ["vacc_ror", "Vaccination ROR (nourrissons)"],
];

export const deptOf = (code: string) => (code.length === 5 ? (code.startsWith("97") ? code.slice(0, 3) : code.slice(0, 2)) : code);

/** Preventive behaviour of the territory's department (Santé publique France, team workbook prototype 2). */
export function PreventionPanel({ code }: { code: string }) {
  const { data } = useDepartementData();
  const dep = deptOf(code);
  const row = data?.departements.find((d) => d.code === dep);
  const v = row?.values;
  return (
    <section className="rounded-2xl border border-[#E7E7E2] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-[#15171C]">Prévention</h3>
        <span className="text-xs text-[#61656E]">{row ? `${row.name} (${dep})` : "Département"}</span>
      </div>
      {!v || v.icp == null ? (
        <p className="mt-3 text-sm text-[#61656E]">Données indisponibles pour ce département.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="num text-[28px] font-semibold leading-none tracking-[-0.03em] text-[#15171C]">{fmt(v.icp, 0)}</span>
            <span className="text-xs text-[#61656E]">/100 · indice de comportement préventif</span>
            {row?.prevention_type && <span className="rounded-full bg-[#F6F6F3] px-2.5 py-1 text-xs font-medium text-[#3A3D44]">{row.prevention_type}</span>}
          </div>
          {[
            ["Dépistage des cancers", v.prev_sub_depistage],
            ["Vaccination", v.prev_sub_vaccination],
          ].map(([label, x]) => (
            <div key={label as string} className="mt-3.5 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5">
              <span className="text-sm text-[#15171C]">{label}</span>
              <span className="num text-sm font-semibold text-[#15171C]">{x == null ? "—" : fmt(x as number, 0)}</span>
              <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[#EEEEE9]">
                <div className="h-full rounded-full bg-[#3E63DD]" style={{ width: `${x ?? 0}%` }} />
              </div>
            </div>
          ))}
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-[13px] font-medium text-[#15171C]">Taux de participation et de couverture</summary>
            <ul className="mt-2 divide-y divide-[#F2F2EE]">
              {RATES.map(([k, label]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                  <span className="text-[#3A3D44]">{label}</span>
                  <span className="num font-semibold text-[#15171C]">{v[k] == null ? "—" : `${fmt(v[k] as number, 1)} %`}</span>
                </li>
              ))}
            </ul>
          </details>
          <p className="mt-3 text-xs text-[#61656E]">
            Valeurs du département (Santé publique France, 2024-2025). Scores = rang parmi les départements (100 = le meilleur).
          </p>
        </>
      )}
    </section>
  );
}

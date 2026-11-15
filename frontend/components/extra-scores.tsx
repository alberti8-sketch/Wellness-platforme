"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BAND_META, bandOf, fmt } from "@/lib/bands";
import { useCommuneRows } from "@/lib/communes";
import { mean } from "@/lib/metrics";
import { useDepartementData } from "@/lib/prediction";
import type { Territory } from "@/lib/types";
import { deptOf } from "./territory-context-panels";
import { Card, ScoreBar } from "./ui";

// Two complementary scores, both 0-100 (higher = better), coloured with the same levels as the index (÷ 10).
const colorOf = (v: number | null | undefined) => {
  const b = bandOf(v == null ? null : v / 10);
  return b ? BAND_META[b].color : "#B9B9B2";
};

// Bar colour per screening: pink for breast cancer, blue for colorectal, light green for the cervix.
const SCREENING_COLOR: Record<string, string> = { depistage_sein: "#E4639E", depistage_colorectal: "#3E63DD", depistage_col: "#7ACB9C" };

const SCREENING: [string, string][] = [
  ["depistage_sein", "Cancer du sein (50-74 ans)"],
  ["depistage_colorectal", "Cancer colorectal (50-74 ans)"],
  ["depistage_col", "Col de l'utérus (25-65 ans)"],
];

function Big({ value, unit = "/100" }: { value: number | null | undefined; unit?: string }) {
  return (
    <div className="mt-4 flex items-baseline gap-2">
      <span className="h-3 w-3 shrink-0 self-center rounded-full" style={{ background: colorOf(value) }} aria-hidden />
      <span className="num text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmt(value, 0)}</span>
      <span className="text-sm text-ink-muted">{unit}</span>
    </div>
  );
}

/** Food-environment score of a commune (team file: BPE 2025 + SIRENE, mRFEI-like method). */
export function FoodScorePanel({ code }: { code: string }) {
  const { byCode, loading } = useCommuneRows([code]);
  const c = byCode[code];
  const v = c?.values;
  return (
    <section className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">Alimentation</h3>
        <span className="text-xs text-ink-muted">Commune</span>
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-ink-muted">Chargement…</p>
      ) : v?.food_score == null ? (
        <p className="mt-3 text-sm text-ink-muted">Score indisponible pour cette commune.</p>
      ) : (
        <>
          <Big value={v.food_score} />
          {c.food_type && <span className="mt-2 inline-block rounded-full bg-plane px-2.5 py-1 text-xs font-medium text-ink-2">{c.food_type}</span>}
          <ul className="mt-4 divide-y divide-[#F2F2EE] text-[13px]">
            {(
              [
                ["Commerces favorables (sur favorables + défavorables)", v.food_balance, "%"],
                ["Commerces de produits frais / 10 000 hab.", v.fresh_10k, ""],
                ["Fast-foods / 10 000 hab.", v.fastfood_10k, ""],
              ] as const
            ).map(([label, x, u]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-ink-2">{label}</span>
                <span className="num font-semibold text-ink">{x == null ? "—" : `${fmt(x, 1)}${u ? ` ${u}` : ""}`}</span>
              </li>
            ))}
          </ul>
          {v.food_reliable === 0 && <p className="mt-2 text-xs text-ink-muted">Petite commune : l&apos;offre réelle se situe souvent dans le bourg voisin.</p>}
          <p className="mt-3 text-xs text-ink-muted">Équilibre de l&apos;offre 40 %, accès aux produits frais 35 %, faible densité de fast-foods 25 % (BPE 2025, SIRENE).</p>
        </>
      )}
    </section>
  );
}

const SCREENING_SHORT: Record<string, string> = { depistage_sein: "Cancer du sein", depistage_colorectal: "Cancer colorectal", depistage_col: "Col de l'utérus" };
const FRANCE_GREY = "#B4B6B0";

type ScreeningRow = { key: string; name: string; label: string; local: number | null; france: number | null };

function ScreeningTip({ active, payload }: { active?: boolean; payload?: { payload: ScreeningRow }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] shadow-[0_6px_20px_rgba(21,23,28,0.12)]">
      <p className="font-semibold text-ink">{r.label}</p>
      <p className="mt-1 flex items-center gap-2 text-ink-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SCREENING_COLOR[r.key] }} aria-hidden /> Département :{" "}
        <span className="num font-semibold text-ink">{fmt(r.local, 1)} %</span>
      </p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FRANCE_GREY }} aria-hidden /> Moyenne France :{" "}
        <span className="num font-semibold text-ink">{fmt(r.france, 1)} %</span>
      </p>
    </div>
  );
}

/** Participation rate per screening: the department (screening colour) vs the French average (grey). */
function ScreeningChart({ rows }: { rows: ScreeningRow[] }) {
  return (
    <>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-ink" aria-hidden>
        {rows.map((r) => (
          <span key={r.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SCREENING_COLOR[r.key] }} /> {r.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FRANCE_GREY }} /> Moyenne France
        </span>
      </div>
      <div
        className="mt-2 h-[260px]"
        role="img"
        aria-label={`Taux de dépistage : ${rows.map((r) => `${r.label} ${fmt(r.local, 1)} % (France ${fmt(r.france, 1)} %)`).join(", ")}`}
      >
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -8 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="#EEEEE9" />
            <XAxis dataKey="name" interval={0} tick={{ fontSize: 13, fill: "#15171C", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#D9D9D3" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 13, fill: "#4A4E57" }} tickLine={false} axisLine={false} tickFormatter={(x: number) => `${x} %`} width={54} />
            <Tooltip content={<ScreeningTip />} cursor={{ fill: "#F6F6F3" }} />
            <Bar dataKey="local" name="Département" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={SCREENING_COLOR[r.key]} />
              ))}
            </Bar>
            <Bar dataKey="france" name="Moyenne France" fill={FRANCE_GREY} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Cancer-screening score of the commune's department (Santé publique France), with the three rates. */
export function ScreeningPanel({ code }: { code: string }) {
  const { data } = useDepartementData();
  const dep = deptOf(code);
  const row = data?.departements.find((d) => d.code === dep);
  const v = row?.values;
  return (
    <section className="rounded-2xl border border-hairline bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-ink">Dépistage des cancers</h3>
        <span className="text-xs text-ink-muted">{row ? `${row.name} (${dep})` : "Département"}</span>
      </div>
      {!v || v.prev_sub_depistage == null ? (
        <p className="mt-3 text-sm text-ink-muted">Données indisponibles pour ce département.</p>
      ) : (
        <>
          <Big value={v.prev_sub_depistage} />
          <ScreeningChart
            rows={SCREENING.map(([k, label]) => ({
              key: k,
              name: SCREENING_SHORT[k],
              label,
              local: v[k] ?? null,
              france: mean((data?.departements ?? []).map((d) => d.values[k])),
            }))}
          />
          <p className="mt-3 text-xs text-ink-muted">
            Score = rang moyen du département sur les trois dépistages (100 = le meilleur). Taux de participation 2024-2025, Santé publique France.
          </p>
        </>
      )}
    </section>
  );
}

/** All tracked cities: food score (commune) and screening score (department), side by side. */
export function ExtraScoresCard({ territories, onPick }: { territories: Territory[]; onPick: (code: string) => void }) {
  const communes = territories.filter((t) => t.code.length === 5);
  const { byCode } = useCommuneRows(communes.map((t) => t.code));
  const { data } = useDepartementData();
  const dept = (code: string) => data?.departements.find((d) => d.code === deptOf(code))?.values.prev_sub_depistage ?? null;
  const rows = communes
    .map((t) => ({ t, food: byCode[t.code]?.values.food_score ?? null, screen: dept(t.code) }))
    .sort((a, b) => (b.food ?? -1) - (a.food ?? -1));
  const Cell = ({ v }: { v: number | null }) => (
    <td className="px-2 py-2">
      <div className="flex items-center gap-3">
        <div className="min-w-[80px] flex-1">
          <ScoreBar score={v == null ? null : v / 10} color={colorOf(v)} height={6} />
        </div>
        <span className="num w-8 text-right text-sm font-semibold text-ink">{fmt(v, 0)}</span>
      </div>
    </td>
  );
  return (
    <Card className="mt-4" title="Alimentation et dépistage" subtitle="Deux scores de 0 à 100 (100 = le plus favorable) · cliquez une ville pour sa vue détaillée">
      <div className="-mx-2 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-xs text-ink-muted">
            <tr className="border-b border-hairline">
              <th className="px-2 py-2 text-left font-medium">Ville</th>
              <th className="px-2 py-2 text-left font-medium">Score alimentation (commune)</th>
              <th className="px-2 py-2 text-left font-medium">Score dépistage (département)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, food, screen }) => (
              <tr key={t.code} className="border-b border-[#F2F2EE] hover:bg-[#FAFAF7]">
                <td className="px-2 py-2">
                  <button onClick={() => onPick(t.code)} className="text-left font-medium text-ink hover:underline">
                    {t.name}
                  </button>
                  {byCode[t.code]?.food_type && <span className="block text-xs text-ink-muted">{byCode[t.code].food_type}</span>}
                </td>
                <Cell v={food} />
                <Cell v={screen} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Alimentation : équilibre de l&apos;offre, accès aux produits frais et densité de fast-foods (BPE 2025, SIRENE). Dépistage : cancers du sein, colorectal et du col
        de l&apos;utérus (Santé publique France).
      </p>
    </Card>
  );
}

/** The complementary scores shown with the index dimensions (on the same 1-10 scale, not weighted in the index). */
export const EXTRA_DIMS = [
  { key: "food", label: "Alimentation", scope: "commune" },
  { key: "screening", label: "Dépistage des cancers", scope: "département" },
] as const;
export type ExtraKey = (typeof EXTRA_DIMS)[number]["key"];

/** Per city, each complementary score on a 0-10 scale (source scores are 0-100). */
export function useExtraScores(territories: Territory[]): Record<ExtraKey, Record<string, number | null>> {
  const { byCode } = useCommuneRows(territories.filter((t) => t.code.length === 5).map((t) => t.code));
  const { data } = useDepartementData();
  const food: Record<string, number | null> = {};
  const screening: Record<string, number | null> = {};
  for (const t of territories) {
    const f = byCode[t.code]?.values.food_score;
    food[t.code] = f == null ? null : f / 10;
    const s = data?.departements.find((d) => d.code === deptOf(t.code))?.values.prev_sub_depistage;
    screening[t.code] = s == null ? null : s / 10;
  }
  return { food, screening };
}

"use client";

import { ArrowRight, Lightbulb, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES } from "@/lib/metrics";
import { fmt } from "@/lib/bands";
import { type Report, fmtInt } from "@/lib/rapport";
import { Card } from "./ui";

/** Export the commune report: PDF through the browser print dialog, or the Markdown file. */
export function ReportActions({ code, name }: { code: string; name: string }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <a href={`/rapport/pdf?ville=${code}`} target="_blank" rel="noopener" className="secondary-btn h-10" title={`Rapport de ${name} au format A4, à enregistrer en PDF`}>
        <Printer className="h-4 w-4" aria-hidden /> Exporter en PDF
      </a>
      <Link href={`/assistant?ville=${code}`} className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white hover:bg-black">
        <Lightbulb className="h-4 w-4" aria-hidden /> Trouver des solutions
      </Link>
    </div>
  );
}

// Short axis labels (the full name is in the tooltip).
const SHORT: Record<string, string> = {
  cardio: "Cardio-neuro-vasculaires",
  risque_vasculaire: "Hypertension, cholestérol",
  diabete: "Diabète",
  cancers: "Cancers",
  psy: "Psychiatriques",
  respiratoire: "Respiratoires",
  neuro: "Neurologiques",
  inflammatoire: "Inflammatoires, rares, VIH",
  foie: "Foie, pancréas",
  rein: "Insuffisance rénale",
};
// Department column: red when above the French average, green otherwise; France average in neutral grey.
const ABOVE = "#C8513A";
const BELOW = "#1F8A78";
const FRANCE = "#B4B6B0";
const colorOf = (r: { local: number; france: number | null }) => (r.france != null && r.local > r.france ? ABOVE : BELOW);

type Row = { key: string; name: string; label: string; local: number; france: number | null; people: number | null };

function ChartTip({ active, payload, population }: { active?: boolean; payload?: { payload: Row }[]; population: number | null }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] shadow-[0_6px_20px_rgba(21,23,28,0.12)]">
      <p className="font-semibold text-ink">{r.label}</p>
      <p className="mt-1 flex items-center gap-2 text-ink-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorOf(r) }} aria-hidden /> Département : <span className="num font-semibold text-ink">{fmt(r.local, 2)} %</span>
      </p>
      <p className="flex items-center gap-2 text-ink-2">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FRANCE }} aria-hidden /> France : <span className="num font-semibold text-ink">{fmt(r.france, 2)} %</span>
      </p>
      <p className="mt-1 text-xs font-semibold" style={{ color: colorOf(r) === ABOVE ? "#9A2F1C" : "#0E5A50" }}>
        {colorOf(r) === ABOVE ? "Au-dessus de la moyenne française" : "En dessous de la moyenne française"}
      </p>
      <p className="num mt-1 text-ink-muted">
        {fmtInt(r.people)}
        {population ? ` / ${fmtInt(population)} habitants` : ""} (estimation)
      </p>
    </div>
  );
}

/** Column chart of the chronic diseases: the commune's department vs France, with the people concerned. */
export function DiseasesSummary({ report, onShowAll }: { report: Report; onShowAll?: () => void }) {
  const rows: Row[] = [...report.diseases.items]
    .sort((a, b) => b.prev - a.prev)
    .map((d) => ({ key: d.key, name: SHORT[d.key] ?? d.label, label: d.label, local: d.prev, france: d.prev_france, people: d.people_commune_est }));
  const dep = report.departement.name ?? report.departement.code;
  return (
    <Card
      title="Maladies chroniques"
      subtitle={`Part de la population concernée (%), département ${dep} face à la France · ${report.diseases.items[0]?.year ?? ""}`}
      actions={
        onShowAll && (
          <button onClick={onShowAll} className="no-print inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
            Toutes les maladies <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      }
    >
      <div className="mb-3 flex flex-wrap gap-4 text-sm font-semibold text-ink" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ABOVE }} /> Département ({dep}) au-dessus de la France
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BELOW }} /> Département en dessous de la France
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FRANCE }} /> Moyenne France
        </span>
      </div>
      <div className="h-[340px]" role="img" aria-label={`Prévalence des maladies chroniques : ${rows.map((r) => `${r.label} ${fmt(r.local, 1)} % (France ${fmt(r.france, 1)} %)`).join(", ")}`}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -8 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#EEEEE9" />
            <XAxis dataKey="name" interval={0} tick={{ fontSize: 13, fill: "#15171C", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#D9D9D3" }} height={52} tickFormatter={(v: string) => (v.length > 15 ? `${v.slice(0, 14)}…` : v)} />
            <YAxis tick={{ fontSize: 13, fill: "#4A4E57" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v} %`} width={54} />
            <Tooltip content={<ChartTip population={report.population} />} cursor={{ fill: "#F6F6F3" }} />
            <Bar dataKey="local" name="Département" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {rows.map((r) => (
                <Cell key={r.key} fill={colorOf(r)} />
              ))}
            </Bar>
            <Bar dataKey="france" name="France" fill={FRANCE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Assurance Maladie, prévalence tous âges du département (pas de donnée par commune). Survolez une colonne pour le nombre de personnes estimé à{" "}
        {report.name}.
      </p>
    </Card>
  );
}

// Land-use colours (categorical, fixed order): built-up grey, urban green light green, natural dark green,
// farmland wheat, water blue.
const LAND = [
  { key: "land_built_pct", label: "Sols artificialisés", note: "bâti, zones d'activité, routes", color: "#8A8D94" },
  { key: "land_green_pct", label: "Espaces verts urbains", note: "parcs, terrains de sport et de loisirs", color: "#7ACB9C" },
  { key: "land_natural_pct", label: "Forêts et milieux naturels", note: "", color: "#1F8A78" },
  { key: "land_agri_pct", label: "Terres agricoles", note: "", color: "#D9C27A" },
  { key: "land_water_pct", label: "Eau et zones humides", note: "", color: "#5B9BD5" },
] as const;

const STREETS = [
  { key: "bike_share", label: "Voirie avec aménagement cyclable" },
  { key: "zone30_share", label: "Voirie en zone 30" },
  { key: "pedestrian_share", label: "Voirie en zone piétonne" },
] as const;

/** Land cover of the commune (share of its area) and calm streets (share of the road network). */
export function LandCard({ report, className }: { report: Report; className?: string }) {
  const land = report.land ?? {};
  const mob = report.mobility ?? {};
  const med = report.references.communes_median;
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const parts = LAND.map((l) => ({ ...l, v: num(land[l.key]) ?? 0 }));
  return (
    <Card className={className} title="Cadre de vie" subtitle="Occupation du sol (part de la surface de la commune) et rues apaisées (part de la voirie)">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex h-10 overflow-hidden rounded-xl" role="img" aria-label={parts.map((p) => `${p.label} ${fmt(p.v, 1)} %`).join(", ")}>
            {parts
              .filter((p) => p.v > 0)
              .map((p) => (
                <span key={p.key} style={{ width: `${p.v}%`, background: p.color }} className="border-r-2 border-white last:border-r-0" title={`${p.label} : ${fmt(p.v, 1)} %`} />
              ))}
          </div>
          <ul className="mt-4 space-y-2">
            {parts.map((p) => (
              <li key={p.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} aria-hidden />
                  <span className="font-semibold text-ink">{p.label}</span>
                  {p.note && <span className="truncate text-xs text-ink-muted">{p.note}</span>}
                </span>
                <span className="shrink-0">
                  <span className="num font-semibold text-ink">{fmt(p.v, 1)} %</span>
                  {med[p.key] != null && <span className="text-xs text-ink-muted"> · réf. {fmt(med[p.key], 1)} %</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <ul className="space-y-4">
          {num(land.osm_green_pct) != null && (
            <li className="rounded-xl bg-[#EAF6EF] px-3.5 py-3">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-ink">Espaces verts et naturels (OpenStreetMap)</span>
                <span className="num font-semibold text-ink">{fmt(num(land.osm_green_pct), 1)} %</span>
              </div>
              <p className="mt-1 text-xs text-ink-2">
                soit <strong className="num font-semibold text-ink">{fmt(num(land.osm_green_m2_hab), 0)} m²</strong> par habitant · parcs, jardins publics, bois,
                prairies, jardins familiaux, y compris les petits
              </p>
            </li>
          )}
          {STREETS.map((st) => {
            const v = num(mob[st.key]);
            const m = med[st.key];
            return (
              <li key={st.key}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{st.label}</span>
                  <span>
                    <span className="num font-semibold text-ink">{fmt(v, 1)} %</span>
                    {m != null && <span className="text-xs text-ink-muted"> · réf. {fmt(m, 1)} %</span>}
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-[#EEEEE9]">
                  <div className="h-full rounded-full bg-[#3E63DD]" style={{ width: `${Math.min(100, v ?? 0)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        Sols : Corine Land Cover 2018 par commune (SDES), zones de 25 ha minimum (petits parcs et jardins non comptés). Voirie : Vélo &amp; Territoires 2024.
        Réf. : médiane des {report.references.communes_scope ?? "communes"} (moyenne pour les espaces verts, zones 30 et piétonnes).
      </p>
    </Card>
  );
}

// Status colours (fixed): never alone — each status also has its label.
export const STATUS_META: Record<string, { label: string; color: string; tint: string; text: string }> = {
  favorable: { label: "Favorable", color: "#1F8A78", tint: "#DDF0EA", text: "#0E5A50" },
  moyen: { label: "Dans la moyenne", color: "#D4A33A", tint: "#F6EDD3", text: "#6E5110" },
  defavorable: { label: "Défavorable", color: "#C8513A", tint: "#FBE6DF", text: "#9A2F1C" },
  nc: { label: "Non mesuré", color: "#B9BAB4", tint: "#EFEFEA", text: "#4A4E57" },
};

/** Dimension of the index (or complementary score) → the health determinant it stands for. */
export const DIMENSION_DETERMINANT: Record<string, string> = {
  SPORT: "activite",
  ENV: "cadre",
  HEALTH: "soins",
  SOCIAL: "precarite",
  food: "alimentation",
  screening: "soins",
};

/** Drawer under a dimension score: the determinant's situation, its indicators and the diseases linked to it. */
export function DimensionDrawer({ report, determinant, only }: { report: Report; determinant: string; only?: string[] }) {
  const d = report.determinants.find((x) => x.key === determinant);
  if (!d) return null;
  const status = STATUS_META[d.status] ?? STATUS_META.nc;
  const scope = report.references.communes_scope ?? "communes";
  const indicators = only ? d.indicators.filter((i) => only.includes(i.key)) : d.indicators;
  const diseases = report.disease_links
    .map((x) => ({ x, link: x.links.find((l) => l.determinant === determinant) }))
    .filter((r): r is { x: (typeof report.disease_links)[number]; link: (typeof report.disease_links)[number]["links"][number] } => !!r.link)
    .filter((r) => !only || !only.includes("prev_sub_depistage") || r.link.source === "dépistage");
  return (
    <div className="mt-3 rounded-xl bg-plane px-3.5 py-3 text-[13px]">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink">{d.label}</span>
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: status.tint, color: status.text }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} aria-hidden />
          {status.label}
        </span>
        <span className="text-xs text-ink-muted">face aux {scope}</span>
      </p>
      <ul className="mt-2 space-y-1">
        {indicators.map((i) => {
          const m = STATUS_META[i.status] ?? STATUS_META.nc;
          const unit = i.unit === "%" ? " %" : i.unit ? ` ${i.unit}` : "";
          return (
            <li key={i.key} className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-ink-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
                <span className="truncate">{i.label}</span>
              </span>
              <span className="num shrink-0">
                <span className="font-semibold text-ink">
                  {fmt(i.value, 1)}
                  {unit}
                </span>
                <span className="text-xs text-ink-muted"> · réf. {fmt(i.reference, 1)}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {diseases.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Maladies liées</p>
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {diseases.map(({ x, link }) => {
              const above = x.prev_france != null && x.prev > x.prev_france;
              return (
                <span key={x.key} title={link.habits.join(", ")} className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-2 py-0.5 text-[11px] text-ink-2">
                  <span className="font-semibold text-ink">{x.label}</span>
                  <span className={above ? "text-[#9A2F1C]" : "text-[#0E5A50]"}>{fmt(x.prev, 1)} %</span>
                  <span className="text-ink-muted">· {link.level === "prévention secondaire" ? "dépistage" : `preuve ${link.level}`}</span>
                </span>
              );
            })}
          </p>
        </>
      )}
    </div>
  );
}

/** One line for the determinants of the evidence base with no local data. */
export function UnmeasuredNote({ report }: { report: Report }) {
  const nc = report.determinants.filter((d) => d.status === "nc");
  if (!nc.length) return null;
  const linked = (key: string) => report.disease_links.filter((x) => x.links.some((l) => l.determinant === key)).length;
  return (
    <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-muted">
      Non mesurés localement : {nc.map((d) => `${d.label.toLowerCase()} (lié à ${linked(d.key)} maladie${linked(d.key) > 1 ? "s" : ""})`).join(", ")}. Ouvrez une ligne pour
      ses indicateurs et ses maladies liées.
    </p>
  );
}

/** The commune and the 3 most similar tracked cities, one theme at a time: one column chart per indicator (real values),
 * and curves for the diseases. */
export function ComparisonCard({ report }: { report: Report }) {
  const { cities, indicators, diseases } = report.comparison;
  const themes = [
    ...indicators
      .filter((i) => i.theme)
      .reduce((m, i) => m.set(i.theme!, i.theme_label ?? i.theme!), new Map<string, string>())
      .entries(),
  ].map(([id, label]) => ({ id, label }));
  // Only the themes with at least one value (tobacco, alcohol and sleep have no local data).
  const withData = themes.filter((t) => indicators.some((i) => i.theme === t.id && cities.some((c) => c.values[i.key] != null)));
  const all = [...withData, { id: "maladies", label: "Maladies" }];
  const [theme, setTheme] = useState(all[0]?.id ?? "maladies");
  const color = (i: number) => SERIES[i % SERIES.length];
  // Question for the assistant: solutions taken from the similar cities doing better (on the selected theme).
  const others = cities.filter((c) => !c.self).map((c) => c.name);
  const themeLabel = all.find((t) => t.id === theme)?.label ?? "";
  const question =
    `En comparant ${report.name} avec ${others.join(", ")} (villes semblables)${themeLabel ? `, sur le thème « ${themeLabel} »` : ""}, ` +
    `quelles solutions ${report.name} peut-elle reprendre des villes qui font mieux ? Appuie-toi sur les écarts chiffrés de la comparaison.`;

  return (
    <Card
      title="Comparaison avec des villes semblables"
      subtitle={report.comparison.method}
      actions={
        <Link
          href={`/assistant?ville=${report.code}&question=${encodeURIComponent(question)}`}
          className="no-print inline-flex h-10 items-center gap-2 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white hover:bg-black"
        >
          <Lightbulb className="h-4 w-4" aria-hidden /> Solutions inspirées de ces villes
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Thème">
          {all.map((t) => (
            <button key={t.id} role="tab" aria-selected={theme === t.id} onClick={() => setTheme(t.id)} className={theme === t.id ? "pill-on" : "pill"}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-ink">
          {cities.map((c, i) => (
            <span key={c.code} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ background: color(i) }} aria-hidden />
              {c.name}
              {c.self && <span className="text-xs font-medium text-ink-muted">(vous)</span>}
            </span>
          ))}
        </div>
      </div>

      {theme === "maladies" ? (
        <DiseaseCurves report={report} color={color} />
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {indicators
            .filter((i) => i.theme === theme)
            .map((i) => {
              const rows = cities.map((c, idx) => ({ name: c.name, value: c.values[i.key] ?? null, self: c.self, idx }));
              const nums = rows.map((r) => r.value).filter((v): v is number => v != null);
              if (!nums.length) return null;
              const best = i.direction === "up" ? Math.max(...nums) : Math.min(...nums);
              const unit = i.unit === "%" ? " %" : i.unit ? ` ${i.unit}` : "";
              return (
                <figure key={i.key} className="rounded-xl border border-hairline p-3">
                  <figcaption className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{i.label}</span>
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      {i.direction === "up" ? "plus haut = mieux" : "plus bas = mieux"}
                      {i.scope === "departement" ? " · département" : ""}
                    </span>
                  </figcaption>
                  <div className="mt-2 h-[170px]" role="img" aria-label={`${i.label} : ${rows.map((r) => `${r.name} ${fmt(r.value, 1)}${unit}`).join(", ")}`}>
                    <ResponsiveContainer>
                      <BarChart data={rows} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
                        <XAxis dataKey="name" interval={0} tick={{ fontSize: 12, fill: "#15171C", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#D9D9D3" }} />
                        <YAxis hide domain={[0, "auto"]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false}>
                          {rows.map((r) => (
                            <Cell key={r.name} fill={color(r.idx)} fillOpacity={r.self ? 1 : 0.55} />
                          ))}
                          <LabelList
                            dataKey="value"
                            position="top"
                            formatter={(v: number | null) => (v == null ? "—" : `${fmt(v, 1)}${unit}${v === best ? " ★" : ""}`)}
                            style={{ fontSize: 12, fontWeight: 700, fill: "#15171C" }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </figure>
              );
            })}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        ★ : la meilleure des villes comparées. Votre commune en couleur pleine.
        {theme === "maladies" ? " Maladies : prévalence du département de chaque ville (plus bas = mieux)." : ""}
      </p>
    </Card>
  );
}

/** Disease prevalence (department of each city) as one curve per city, in %. */
function DiseaseCurves({ report, color }: { report: Report; color: (i: number) => string }) {
  const { cities, diseases } = report.comparison;
  const data = diseases.map((d) => ({
    name: SHORT_DIS[d.key] ?? d.label,
    label: d.label,
    ...Object.fromEntries(cities.map((c) => [c.code, c.diseases[d.key] ?? null])),
  }));
  const Tip = ({ active, payload }: { active?: boolean; payload?: { payload: Record<string, number | string | null> }[] }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    return (
      <div className="rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] shadow-[0_6px_20px_rgba(21,23,28,0.12)]">
        <p className="mb-1 font-semibold text-ink">{row.label}</p>
        {cities.map((c, i) => (
          <p key={c.code} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-3 rounded-sm" style={{ background: color(i) }} aria-hidden />
              <span className={c.self ? "font-semibold text-ink" : ""}>{c.name}</span>
            </span>
            <span className="num font-semibold text-ink">{row[c.code] == null ? "—" : `${fmt(row[c.code] as number, 2)} %`}</span>
          </p>
        ))}
      </div>
    );
  };
  return (
    <div className="mt-5 h-[300px]" role="img" aria-label={`Prévalence des maladies dans le département de ${report.name} et des villes semblables`}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#EEEEE9" />
          <XAxis dataKey="name" interval={0} padding={{ left: 36, right: 36 }} tick={{ fontSize: 13, fill: "#15171C", fontWeight: 600 }} tickLine={false} axisLine={{ stroke: "#D9D9D3" }} />
          <YAxis tick={{ fontSize: 12, fill: "#4A4E57" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v} %`} width={48} />
          <Tooltip content={<Tip />} cursor={{ stroke: "#D9D9D3" }} />
          {cities.map((c, i) => (
            <Line
              key={c.code}
              dataKey={c.code}
              name={c.name}
              stroke={color(i)}
              strokeWidth={c.self ? 4 : 2}
              dot={{ r: c.self ? 5 : 4, strokeWidth: 2, stroke: "#FFFFFF", fill: color(i) }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const SHORT_DIS: Record<string, string> = {
  diabete: "Diabète",
  cardio: "Cardio-vasc.",
  respiratoire: "Respiratoires",
  psy: "Psychiatriques",
  cancers: "Cancers",
};

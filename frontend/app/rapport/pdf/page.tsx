"use client";

import { Printer } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { STATUS_META } from "@/components/report-blocks";
import { useSession } from "@/components/session";
import { BAND_META, fmt } from "@/lib/bands";
import { TYPE_LABEL } from "@/lib/metrics";
import { type Report, fmtInt, useCurrentCity, useReport } from "@/lib/rapport";
import type { BandCode } from "@/lib/types";

/** Printable report of a commune (A4): plain words, one explanation per section, bars readable in black and white. */
export default function ReportPdfPage() {
  const { authReady, loggedIn } = useSession();
  const [city] = useCurrentCity();
  const { data, error } = useReport(authReady && loggedIn ? city : null);
  const printed = useRef(false);

  // Opens the print dialog once the report is drawn (« Enregistrer en PDF »).
  useEffect(() => {
    if (!data || printed.current) return;
    printed.current = true;
    document.title = `Rapport santé — ${data.name}`;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [data]);

  if (authReady && !loggedIn) return <Center>Connectez-vous pour exporter le rapport.</Center>;
  if (error) return <Center>{error}</Center>;
  if (!data) return <Center>Préparation du rapport…</Center>;
  return <Doc r={data} />;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="grid min-h-screen place-items-center bg-white text-sm text-ink-muted">{children}</div>;
}

const today = () => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const signed = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v), d)}`;

function Section({ n, title, intro, children }: { n: number; title: string; intro: string; children: ReactNode }) {
  return (
    <section className="report-section mt-8">
      <h2 className="flex items-baseline gap-2 border-b-2 border-ink pb-1.5 text-[17px] font-bold text-ink">
        <span className="num">{n}.</span> {title}
      </h2>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">{intro}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Horizontal bar with an optional reference tick (works in black and white: value written next to it). */
function Bar({ value, max, color, reference }: { value: number | null; max: number; color: string; reference?: number | null }) {
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="relative h-3 w-full rounded-sm border border-[#C9CAC4] bg-white">
      {value != null && <div className="h-full rounded-sm" style={{ width: pct(value), background: color }} />}
      {reference != null && <span className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: pct(reference) }} aria-hidden />}
    </div>
  );
}

function Doc({ r }: { r: Report }) {
  const band = (r.score.band ?? null) as BandCode | null;
  const scope = r.references.communes_scope ?? "communes de même taille";
  const med = r.references.communes_median;
  const dmean = r.references.departements_mean;
  const items = r.diseases.items;
  const maxPrev = Math.max(...items.map((d) => Math.max(d.prev, d.prev_france ?? 0)), 1);
  const above = items.filter((d) => d.prev_france != null && d.prev > d.prev_france);
  const rising = items.filter((d) => d.trend_pts >= 0.5);
  const p = r.prevention;
  const num = (v: unknown) => (typeof v === "number" ? v : null);

  return (
    <div className="report-doc mx-auto max-w-[210mm] bg-white px-[14mm] py-[12mm] text-ink">
      <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-xl bg-plane px-4 py-3 text-sm">
        <span className="text-ink-2">Dans la fenêtre d&apos;impression, choisissez « Enregistrer au format PDF ».</span>
        <button onClick={() => window.print()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3 font-semibold text-white">
          <Printer className="h-4 w-4" aria-hidden /> Imprimer / PDF
        </button>
      </div>

      {/* Header */}
      <header className="flex items-start justify-between gap-6 border-b border-hairline pb-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Rapport santé de la commune</p>
          <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-[-0.02em]">{r.name}</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            {r.type ? `${TYPE_LABEL[r.type] ?? r.type} · ` : ""}
            {fmtInt(r.population)} habitants · {r.departement.name} ({r.departement.code})
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">Édité le {today()} · données {r.period}</p>
        </div>
        <div className="shrink-0 rounded-xl border-2 border-ink px-4 py-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Score santé</p>
          <p className="num text-[34px] font-bold leading-none">
            {fmt(r.score.value)}
            <span className="text-[15px] font-semibold text-ink-muted"> /10</span>
          </p>
          {band && (
            <p className="mt-1 text-[12px] font-semibold" style={{ color: BAND_META[band].text }}>
              Niveau {BAND_META[band].label}
            </p>
          )}
          <p className="text-[11px] text-ink-muted">
            {r.score.rank}ᵉ sur {r.score.of} villes suivies
          </p>
        </div>
      </header>

      {/* In short */}
      <section className="report-section report-avoid mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[#BFE3D7] bg-[#F1FAF6] p-4">
          <h2 className="text-[14px] font-bold text-[#0E5A50]">✓ Ce qui va bien</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-ink-2">
            {r.findings.strengths.length ? r.findings.strengths.map((s) => <li key={s}>{s}</li>) : <li>Aucun point nettement au-dessus de la moyenne.</li>}
          </ul>
        </div>
        <div className="rounded-xl border border-[#F2CFC4] bg-[#FDF4F1] p-4">
          <h2 className="text-[14px] font-bold text-[#9A2F1C]">! Ce qui est à améliorer</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12.5px] leading-snug text-ink-2">
            {r.findings.weaknesses.length ? r.findings.weaknesses.map((s) => <li key={s}>{s}</li>) : <li>Aucun point nettement sous la moyenne.</li>}
          </ul>
        </div>
      </section>

      <section className="report-section report-avoid report-page-end mt-4 rounded-xl bg-plane p-4 text-[12px] leading-relaxed text-ink-2">
        <h2 className="text-[13px] font-bold text-ink">Comment lire ce rapport</h2>
        <p className="mt-1">
          Le <strong>score santé</strong> (1 à 10) résume quatre dimensions : sport, environnement, offre de soins et social. Il est noté{" "}
          <strong>Best</strong> à partir de 7, <strong>Middle</strong> de 4 à 6,9, <strong>Bad</strong> sous 4. Les <strong>maladies</strong> sont mesurées par
          l&apos;Assurance Maladie pour tout le département : le nombre d&apos;habitants concernés dans la commune est une estimation. Les comparaisons se font avec la{" "}
          <strong>référence</strong> des {scope} (valeur du milieu) et avec la moyenne française. Le trait vertical sur une barre marque cette référence.
        </p>
      </section>

      <Section
        n={1}
        title="Les maladies chroniques"
        intro={`Part de la population soignée pour chaque maladie dans le département, comparée à la France. ${
          above.length ? `${above.length} maladie(s) au-dessus de la moyenne française.` : "Aucune maladie n'est au-dessus de la moyenne française."
        } ${rising.length ? `${rising.length} sont en hausse depuis ${items[0]?.trend_from_year}.` : ""}`}
      >
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-ink text-left text-[11px] text-ink-muted">
              <th className="py-1.5 font-semibold">Maladie</th>
              <th className="w-[34%] py-1.5 font-semibold">Département (barre) · France (trait)</th>
              <th className="py-1.5 text-right font-semibold">Dépt</th>
              <th className="py-1.5 text-right font-semibold">France</th>
              <th className="py-1.5 text-right font-semibold">Depuis {items[0]?.trend_from_year}</th>
              <th className="py-1.5 text-right font-semibold">Habitants concernés*</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => {
              const up = d.prev_france != null && d.prev > d.prev_france;
              return (
                <tr key={d.key} className="border-b border-[#E3E3DE]">
                  <td className="py-1.5 pr-2 font-semibold">{d.label}</td>
                  <td className="py-1.5 pr-3">
                    <Bar value={d.prev} max={maxPrev} reference={d.prev_france} color={up ? "#C8513A" : "#1F8A78"} />
                  </td>
                  <td className="num whitespace-nowrap py-1.5 text-right font-semibold">{fmt(d.prev, 2)} %</td>
                  <td className="num whitespace-nowrap py-1.5 text-right text-ink-2">{fmt(d.prev_france, 2)} %</td>
                  <td className="num whitespace-nowrap py-1.5 text-right">{signed(d.trend_pts)} pt</td>
                  <td className="num whitespace-nowrap py-1.5 text-right">
                    {fmtInt(d.people_commune_est)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-ink-muted">Barre rouge : au-dessus de la France · barre verte : en dessous. * Estimation pour {fmtInt(r.population)} habitants.</p>
      </Section>

      <Section n={2} title="Le score par dimension" intro="Chaque dimension est notée de 1 à 10. Le trait vertical marque la moyenne des villes suivies.">
        <table className="w-full text-[12px]">
          <tbody>
            {r.dimensions.map((d) => (
              <tr key={d.code} className="border-b border-[#E3E3DE]">
                <td className="w-[28%] py-1.5 font-semibold">
                  {d.label} <span className="font-normal text-ink-muted">· poids {fmt(d.weight, 0)} %</span>
                </td>
                <td className="py-1.5 pr-3">
                  <Bar value={d.score} max={10} reference={d.average} color={d.score != null && d.average != null && d.score < d.average ? "#C8513A" : "#1F8A78"} />
                </td>
                <td className="num w-[16%] whitespace-nowrap py-1.5 text-right">
                  <strong>{fmt(d.score)}</strong>
                  <span className="text-ink-muted"> · moy. {fmt(d.average)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        n={3}
        title="Les déterminants de santé"
        intro={`Les habitudes et le cadre de vie qui influencent ces maladies, d'après les études scientifiques réunies par l'équipe. La situation de ${r.name} est comparée aux ${scope}.`}
      >
        <div className="space-y-2.5">
          {r.determinants.map((d) => {
            const m = STATUS_META[d.status] ?? STATUS_META.nc;
            const linked = r.disease_links.filter((x) => x.links.some((l) => l.determinant === d.key)).map((x) => x.label);
            return (
              <div key={d.key} className="report-row rounded-lg border border-[#E3E3DE] px-3 py-2">
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="font-bold">{d.label}</span>
                  <span className="text-[11.5px] font-bold" style={{ color: m.text }}>
                    {d.status === "favorable" ? "▲ " : d.status === "defavorable" ? "▼ " : "● "}
                    {m.label}
                  </span>
                </p>
                {d.indicators.length > 0 && (
                  <p className="mt-0.5 text-[11.5px] text-ink-2">
                    {d.indicators
                      .filter((i) => i.value != null)
                      .map((i) => `${i.label} : ${fmt(i.value, 1)}${i.unit === "%" ? " %" : i.unit ? ` ${i.unit}` : ""} (réf. ${fmt(i.reference, 1)})`)
                      .join(" · ")}
                  </p>
                )}
                {linked.length > 0 && <p className="mt-0.5 text-[11px] text-ink-muted">Maladies liées : {linked.join(", ")}</p>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        n={4}
        title="Le dépistage des cancers"
        intro={`Part des personnes invitées qui ont fait leur dépistage, dans le département, comparée à la moyenne des départements. Score de participation : ${fmt(num(p.prev_sub_depistage), 0)}/100 (100 = le meilleur département).`}
      >
        <table className="w-full text-[12px]">
          <tbody>
            {(
              [
                ["Cancer du sein (femmes de 50 à 74 ans)", "depistage_sein", "#E4639E"],
                ["Cancer colorectal (50 à 74 ans)", "depistage_colorectal", "#3E63DD"],
                ["Col de l'utérus (femmes de 25 à 65 ans)", "depistage_col", "#7ACB9C"],
              ] as const
            ).map(([label, k, color]) => (
              <tr key={k} className="border-b border-[#E3E3DE]">
                <td className="w-[36%] py-1.5 font-semibold">{label}</td>
                <td className="py-1.5 pr-3">
                  <Bar value={num(p[k])} max={100} reference={dmean[k] ?? null} color={color} />
                </td>
                <td className="num w-[18%] whitespace-nowrap py-1.5 text-right">
                  <strong>{fmt(num(p[k]), 1)} %</strong>
                  <span className="text-ink-muted"> · moy. {fmt(dmean[k], 1)} %</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section
        n={5}
        title="Le cadre de vie"
        intro="Comment est occupé le territoire de la commune (images satellite Corine Land Cover 2018) et quelle part des rues est apaisée pour la marche et le vélo."
      >
        <div className="grid grid-cols-2 gap-5">
          <table className="w-full text-[12px]">
            <tbody>
              {(
                [
                  ["Sols artificialisés", "land_built_pct"],
                  ["Espaces verts urbains", "land_green_pct"],
                  ["Forêts et milieux naturels", "land_natural_pct"],
                  ["Terres agricoles", "land_agri_pct"],
                  ["Eau et zones humides", "land_water_pct"],
                ] as const
              ).map(([label, k]) => (
                <tr key={k} className="border-b border-[#E3E3DE]">
                  <td className="py-1.5 font-semibold">{label}</td>
                  <td className="num whitespace-nowrap py-1.5 text-right">
                    <strong>{fmt(r.land?.[k], 1)} %</strong>
                    {med[k] != null && <span className="text-ink-muted"> · réf. {fmt(med[k], 1)} %</span>}
                  </td>
                </tr>
              ))}
              {r.land?.osm_green_pct != null && (
                <tr className="border-b border-[#E3E3DE]">
                  <td className="py-1.5 font-semibold">
                    Espaces verts et naturels <span className="font-normal text-ink-muted">(OpenStreetMap, petits parcs compris)</span>
                  </td>
                  <td className="num whitespace-nowrap py-1.5 text-right">
                    <strong>{fmt(r.land.osm_green_pct, 1)} %</strong>
                    <span className="text-ink-muted"> · {fmt(r.land.osm_green_m2_hab, 0)} m²/hab.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <table className="w-full text-[12px]">
            <tbody>
              {(
                [
                  ["Rues avec aménagement cyclable", "bike_share"],
                  ["Rues en zone 30", "zone30_share"],
                  ["Rues piétonnes", "pedestrian_share"],
                ] as const
              ).map(([label, k]) => (
                <tr key={k} className="border-b border-[#E3E3DE]">
                  <td className="py-1.5 font-semibold">{label}</td>
                  <td className="num whitespace-nowrap py-1.5 text-right">
                    <strong>{fmt(num(r.mobility?.[k]), 1)} %</strong>
                    {med[k] != null && <span className="text-ink-muted"> · réf. {fmt(med[k], 1)} %</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        n={6}
        title="Comparaison avec des villes semblables"
        intro={`${r.comparison.method} En gras : la meilleure valeur de chaque ligne.`}
      >
        <table className="w-full text-[11.5px]">
          <thead>
            <tr className="border-b border-ink text-[11px]">
              <th className="py-1.5 text-left font-semibold text-ink-muted">Indicateur</th>
              {r.comparison.cities.map((c) => (
                <th key={c.code} className="py-1.5 text-right font-bold">
                  {c.name}
                  {c.self ? " (vous)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Score santé (/10)", up: true, vals: r.comparison.cities.map((c) => c.score), d: 1, unit: "" },
              ...r.comparison.indicators
                .filter((i) => r.comparison.cities.some((c) => c.values[i.key] != null))
                .map((i) => ({
                  label: i.label,
                  up: i.direction === "up",
                  vals: r.comparison.cities.map((c) => c.values[i.key] ?? null),
                  d: 1,
                  unit: i.unit === "%" ? " %" : "",
                })),
              ...r.comparison.diseases.map((dz) => ({
                label: `${dz.label} (%)`,
                up: false,
                vals: r.comparison.cities.map((c) => c.diseases[dz.key] ?? null),
                d: 2,
                unit: "",
              })),
            ].map((row) => {
              const nums = row.vals.filter((v): v is number => v != null);
              const best = nums.length ? (row.up ? Math.max(...nums) : Math.min(...nums)) : null;
              return (
                <tr key={row.label} className="border-b border-[#E3E3DE]">
                  <td className="py-1 text-ink-2">{row.label}</td>
                  {row.vals.map((v, i) => (
                    <td key={i} className={`num whitespace-nowrap py-1 text-right ${v != null && v === best ? "font-bold" : ""}`}>
                      {v == null ? "—" : `${fmt(v, row.d)}${row.unit}`}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <section className="report-section mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-ink-muted">
        <h2 className="text-[12px] font-bold text-ink">Petit glossaire</h2>
        <p className="mt-1">
          <strong>Prévalence</strong> : part de la population soignée pour une maladie une année donnée. <strong>Référence</strong> : valeur du milieu (médiane) des{" "}
          {scope} ; moyenne pour les espaces verts et les rues apaisées. <strong>Déterminant de santé</strong> : facteur qui influence la santé (activité
          physique, alimentation, cadre de vie, accès aux soins, revenus…).
        </p>
        <h2 className="mt-3 text-[12px] font-bold text-ink">Sources</h2>
        <p className="mt-1">
          Assurance Maladie (cartographie des pathologies, data.ameli.fr) · Santé publique France (Odissé) · INSEE · SIRENE et BPE 2025 · Vélo &amp; Territoires 2024 ·
          Baromètre des villes marchables 2023 · Recensement des équipements sportifs · INJEP 2023 · Corine Land Cover 2018 (SDES) · base de preuves de
          l&apos;équipe (méta-analyses).
        </p>
      </section>
    </div>
  );
}

"use client";

import { Apple, Bike, CigaretteOff, HandCoins, HeartPulse, type LucideIcon, MoonStar, Stethoscope, Trees, WineOff } from "lucide-react";
import type { Priority, Structured } from "@/lib/rapport";

/** Representative icon and colour of each theme (health determinant) of a solution. */
const THEMES: { match: RegExp; icon: LucideIcon; color: string; tint: string }[] = [
  { match: /activit|sport|mobilit|marche|vélo|velo/i, icon: Bike, color: "#2A78D6", tint: "#E7F0FB" },
  { match: /aliment|poids|nutrition|fast/i, icon: Apple, color: "#D9592B", tint: "#FCEDE6" },
  { match: /cadre|environnement|vert|végétal|vegetal|air|urban/i, icon: Trees, color: "#1F8A78", tint: "#E3F3EE" },
  { match: /soin|dépistage|depistage|médec|medec|prévention|prevention|vaccin/i, icon: Stethoscope, color: "#6250D6", tint: "#EEEBFB" },
  { match: /précarit|precarit|social|pauvret/i, icon: HandCoins, color: "#B7791F", tint: "#FBF1DF" },
  { match: /tabac/i, icon: CigaretteOff, color: "#61656E", tint: "#EFEFEA" },
  { match: /alcool/i, icon: WineOff, color: "#9A2F1C", tint: "#FBE6DF" },
  { match: /sommeil/i, icon: MoonStar, color: "#3B4A8F", tint: "#E8EBF7" },
];
const themeOf = (p: Priority) => THEMES.find((t) => t.match.test(`${p.determinant} ${p.titre}`)) ?? { icon: HeartPulse, color: "#15171C", tint: "#EFEFEA" };

const HORIZON: Record<string, string> = { court: "Court terme", moyen: "Moyen terme", long: "Long terme" };
const LEVEL: Record<string, string> = { fort: "Preuve forte", moyen: "Preuve moyenne", "modéré": "Preuve modérée" };

/** A compact card per solution: big theme icon, title, the action in one sentence, two badges. */
function SolutionCard({ p }: { p: Priority }) {
  const t = themeOf(p);
  const Icon = t.icon;
  return (
    <article className="flex flex-col items-center rounded-2xl border border-hairline bg-white p-5 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full" style={{ background: t.tint, color: t.color }} aria-hidden>
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-3 text-[16px] font-bold leading-snug text-ink">{p.titre}</h3>
      {p.action && <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-2">{p.action}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {HORIZON[p.horizon] && <span className="rounded-full bg-plane px-2.5 py-1 text-[12px] font-semibold text-ink-2">{HORIZON[p.horizon]}</span>}
        {LEVEL[p.niveau_preuve] && <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-white">★ {LEVEL[p.niveau_preuve]}</span>}
      </div>
      {(p.constat || p.preuve || p.comparaison) && (
        <details className="mt-3 w-full text-left">
          <summary className="cursor-pointer text-center text-[12px] font-medium text-ink-muted hover:text-ink">Détail</summary>
          <dl className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
            {p.constat && (
              <div>
                <dt className="inline font-semibold text-ink">Constat · </dt>
                <dd className="inline">{p.constat}</dd>
              </div>
            )}
            {p.preuve && (
              <div>
                <dt className="inline font-semibold text-ink">Pourquoi · </dt>
                <dd className="inline">{p.preuve}</dd>
              </div>
            )}
            {p.comparaison && (
              <div>
                <dt className="inline font-semibold text-ink">Ailleurs · </dt>
                <dd className="inline">{p.comparaison}</dd>
              </div>
            )}
            {p.indicateur && (
              <div>
                <dt className="inline font-semibold text-ink">À suivre · </dt>
                <dd className="inline">{p.indicateur}</dd>
              </div>
            )}
          </dl>
        </details>
      )}
    </article>
  );
}

/** A structured answer of the assistant: the summary sentence, then one compact card per solution. */
export function StructuredAnswer({ s }: { s: Structured }) {
  return (
    <div className="space-y-4">
      {s.synthese && <p className="px-1 text-[15px] leading-relaxed text-ink">{s.synthese}</p>}
      {s.priorites.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {s.priorites.map((p, i) => (
            <SolutionCard key={i} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

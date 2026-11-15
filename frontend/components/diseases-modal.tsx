"use client";

import { ArrowDownRight, ArrowUpRight, Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { fmt } from "@/lib/bands";
import { type Disease, type Report, fmtInt } from "@/lib/rapport";
import { cx } from "./ui";

const question = (d: Disease, city: string) =>
  `Quelles solutions la mairie peut-elle mettre en place pour réduire « ${d.label} » à ${city} ?`;

function Row({ d, city, code, pop }: { d: Disease; city: string; code: string; pop: number | null }) {
  const above = d.ratio_france != null && d.ratio_france >= 1.05;
  const below = d.ratio_france != null && d.ratio_france <= 0.95;
  const habits = [...new Set(d.evidence.map((e) => e.habitude))];
  return (
    <li className="grid gap-4 border-b border-[#F2F2EE] py-4 last:border-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold text-ink">{d.label}</span>
          {d.kind !== "maladie" && <span className="rounded-full bg-plane px-2 py-0.5 text-[11px] font-medium text-ink-muted">facteur de risque</span>}
        </p>
        <p className="num mt-1 text-sm text-ink-2">
          <strong className="font-semibold text-ink">{fmtInt(d.people_commune_est)}</strong>
          {pop ? ` / ${fmtInt(pop)} habitants` : ""} <span className="text-ink-muted">(estimation)</span>
        </p>
        {habits.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-1.5">
            {habits.slice(0, 4).map((h) => (
              <span key={h} className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-2">
                {h}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="text-sm">
        <p>
          <span className="num text-[22px] font-semibold text-ink">{fmt(d.prev, 2)} %</span>{" "}
          <span className="text-ink-muted">· France {fmt(d.prev_france, 2)} %</span>
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cx(
              "rounded-full px-2 py-0.5 font-semibold",
              above ? "bg-[#FBE6DF] text-[#9A2F1C]" : below ? "bg-[#DDF0EA] text-[#0E5A50]" : "bg-plane text-ink-2",
            )}
          >
            {above ? "au-dessus de la France" : below ? "en dessous de la France" : "comme la France"}
          </span>
          <span className={cx("inline-flex items-center gap-0.5", d.trend_pts > 0 ? "text-[#9A2F1C]" : "text-[#0E5A50]")}>
            {d.trend_pts > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
            {d.trend_pts > 0 ? "+" : ""}
            {fmt(d.trend_pts, 2)} pt depuis {d.trend_from_year}
          </span>
        </p>
      </div>
      <Link
        href={`/assistant?ville=${code}&question=${encodeURIComponent(question(d, city))}`}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-black"
      >
        <Lightbulb className="h-4 w-4" aria-hidden /> Trouver des solutions
      </Link>
    </li>
  );
}

/** Pop-in with all the chronic diseases of the commune (opened from the report, and right after signing in). */
export function DiseasesModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const items = report.diseases.items;
  const above = items.filter((d) => (d.ratio_france ?? 0) >= 1.05).length;
  const rising = items.filter((d) => d.trend_pts >= 0.5).length;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus();
    };
  }, [onClose]);

  return (
    <div className="no-print fixed inset-0 z-[2000] flex items-start justify-center overflow-y-auto bg-[rgba(21,23,28,0.45)] p-4 md:p-10" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="maladies-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[1040px] rounded-2xl bg-white shadow-[0_24px_64px_rgba(21,23,28,0.25)] outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5">
          <div>
            <h2 id="maladies-title" className="text-[22px] font-semibold tracking-[-0.01em] text-ink">
              Les maladies à {report.name}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {above ? `${above} maladie${above > 1 ? "s" : ""} au-dessus de la moyenne française` : "Aucune maladie au-dessus de la moyenne française"}
              {rising ? ` · ${rising} en hausse depuis ${items[0]?.trend_from_year}` : ""} · département {report.departement.name ?? ""} ({report.departement.code}),{" "}
              {items[0]?.year}
            </p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-ink-muted hover:bg-plane" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <ul className="px-6">
          {items.map((d) => (
            <Row key={d.key} d={d} city={report.name} code={report.code} pop={report.population} />
          ))}
        </ul>
        <p className="border-t border-hairline px-6 py-4 text-xs leading-relaxed text-ink-muted">
          {report.diseases.source}. Prévalences publiées par département : le nombre de personnes de la commune est une estimation (prévalence × population).
          Étiquettes : habitudes de vie liées à la maladie selon la base de preuves de l&apos;équipe.
        </p>
      </div>
    </div>
  );
}

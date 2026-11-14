"use client";

import { BookOpen, ExternalLink, FlaskConical, Target, UserCog } from "lucide-react";
import type { Catalog, Dimension, Evidence, WeightBasis } from "@/lib/types";
import { Card, cx } from "./ui";

const BASIS_META: Record<WeightBasis["basis"], { label: string; icon: typeof BookOpen; className: string; title: string }> = {
  evidence: {
    label: "Fondé sur des preuves",
    icon: FlaskConical,
    className: "bg-brand-50 text-brand",
    title: "Poids appuyé par des associations chiffrées (méta-analyses)",
  },
  expert: {
    label: "Poids d'expert",
    icon: UserCog,
    className: "bg-plane text-ink-2 ring-1 ring-inset ring-hairline",
    title: "Poids issu de PONDERATION 3, sans association chiffrée dans le classeur : à justifier",
  },
  outcome: {
    label: "Indicateur de résultat",
    icon: Target,
    className: "bg-plane text-ink-2 ring-1 ring-inset ring-hairline",
    title: "Sert à calibrer les poids, pas à les additionner",
  },
};

export function BasisBadge({ basis }: { basis: WeightBasis["basis"] }) {
  const m = BASIS_META[basis];
  const Icon = m.icon;
  return (
    <span title={m.title} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", m.className)}>
      <Icon className="h-3 w-3" aria-hidden />
      {m.label}
    </span>
  );
}

function LevelTag({ level }: { level: Evidence["level"] }) {
  // Text + weight carry the level; no status colour (these are not health bands).
  return <span className={cx("whitespace-nowrap", level === "Fort" ? "font-semibold text-ink" : "text-ink-2")}>{level}</span>;
}

function SourceLink({ e, workbook }: { e: Evidence; workbook: string }) {
  if (!e.source) return <span className="text-ink-muted" title={workbook}>Classeur (sans référence dédiée)</span>;
  return (
    <a href={e.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-brand underline-offset-2 hover:underline" title={e.source.documents}>
      {e.source.title}
      <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function DimensionSources({ d, workbook }: { d: Dimension; workbook: string }) {
  const b = d.weight_basis;
  return (
    <details className="group rounded-lg border border-hairline" open={b.basis === "evidence"}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2.5">
        <span className="font-medium text-ink">{d.label}</span>
        <span className="tabular-nums text-xs text-ink-2">poids par défaut {d.default_weight} %</span>
        <BasisBadge basis={b.basis} />
        {b.evidence.length > 0 && <span className="text-xs text-ink-muted">{b.evidence.length} association(s)</span>}
        <span className="ml-auto text-xs text-ink-muted group-open:hidden">Afficher</span>
        <span className="ml-auto hidden text-xs text-ink-muted group-open:inline">Masquer</span>
      </summary>
      <div className="space-y-3 border-t border-hairline px-3 py-3 text-sm">
        <p className="text-ink-2">{b.rationale}</p>
        {b.evidence.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="text-left text-ink-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Maladie</th>
                  <th className="py-1.5 pr-3 font-medium">Facteur</th>
                  <th className="py-1.5 pr-3 font-medium">Association documentée</th>
                  <th className="py-1.5 pr-3 font-medium">Niveau de preuve</th>
                  <th className="py-1.5 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {b.evidence.map((e, i) => (
                  <tr key={i} className="border-t border-hairline align-top">
                    <td className="py-1.5 pr-3 text-ink">{e.disease}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{e.factor}</td>
                    <td className="py-1.5 pr-3 text-ink-2">{e.effect}</td>
                    <td className="py-1.5 pr-3">
                      <LevelTag level={e.level} />
                    </td>
                    <td className="py-1.5">
                      <SourceLink e={e} workbook={workbook} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {b.references.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-ink-muted">Références et données de cadrage</p>
            <ul className="space-y-1 text-xs">
              {b.references.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 text-brand underline-offset-2 hover:underline">
                    {r.title}
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  </a>
                  <span className="text-ink-muted"> — {r.documents}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

export function WeightSources({ catalog }: { catalog: Catalog }) {
  const c = catalog.composite_basis;
  const expert = catalog.dimensions.filter((d) => d.weight_basis.basis === "expert");
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4" /> Sources des pondérations
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-2">
          <strong className="text-ink">Pourquoi un indice additif ?</strong> {c.factor} : {c.effect.toLowerCase()} (niveau de preuve {c.level.toLowerCase()}
          {c.source && (
            <>
              ,{" "}
              <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">
                {c.source.title}
              </a>
            </>
          )}
          ).
        </p>
        {expert.length > 0 && (
          <p className="rounded-lg bg-plane px-3 py-2 text-xs text-ink-2">
            {expert.map((d) => d.label).join(", ")} : poids d'expert issus de PONDERATION 3. Le classeur source ne contient pas encore d'association chiffrée pour
            ces dimensions ; elles restent à justifier.
          </p>
        )}
        {catalog.dimensions.map((d) => (
          <DimensionSources key={d.code} d={d} workbook={catalog.evidence_workbook} />
        ))}
        <p className="text-xs text-ink-muted">Source : {catalog.evidence_workbook} et feuille « Sources ».</p>
      </div>
    </Card>
  );
}

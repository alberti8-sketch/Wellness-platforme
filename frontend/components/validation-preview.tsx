"use client";

import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Indicator, Issue, ValidationReport } from "@/lib/types";
import { cx } from "./ui";

const ID_COLS = ["territory_code", "territory_name", "period"];

export function ValidationPreview({ report, indicators }: { report: ValidationReport; indicators: Indicator[] }) {
  const cols = [...ID_COLS, ...indicators.map((i) => i.code).filter((c) => report.indicator_columns.includes(c))];
  const byCell = new Map<string, Issue>();
  const byRow = new Map<number, Issue[]>();
  for (const i of report.issues) {
    if (i.row === null) continue;
    byRow.set(i.row, [...(byRow.get(i.row) ?? []), i]);
    const k = `${i.row}:${i.column ?? ""}`;
    const prev = byCell.get(k);
    if (!prev || (prev.severity === "warning" && i.severity === "error")) byCell.set(k, i);
  }
  const fileIssues = report.issues.filter((i) => i.row === null);
  const label = (c: string) => indicators.find((i) => i.code === c)?.label ?? c;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e3f5e3] px-3 py-1 text-[#006300]">
          <CheckCircle2 className="h-4 w-4" /> {report.rows.length} ligne(s) valide(s) sur {report.raw_rows.length}
        </span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1", report.error_count ? "bg-[#fbe4e4] text-[#a12626]" : "bg-plane text-ink-2")}>
          <AlertCircle className="h-4 w-4" /> {report.error_count} erreur(s) bloquante(s)
        </span>
        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1", report.warning_count ? "bg-[#fff3d6] text-[#7a5200]" : "bg-plane text-ink-2")}>
          <AlertTriangle className="h-4 w-4" /> {report.warning_count} avertissement(s)
        </span>
      </div>

      {fileIssues.length > 0 && (
        <ul className="space-y-1 text-sm">
          {fileIssues.map((i, n) => (
            <li key={n} className="flex items-start gap-2">
              {i.severity === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-band-bad" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b07800]" />}
              <span className="text-ink-2">{i.message}</span>
            </li>
          ))}
        </ul>
      )}

      {report.raw_rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="min-w-full text-xs">
            <thead className="bg-plane text-left text-ink-2">
              <tr>
                <th className="px-2 py-2 font-medium">Ligne</th>
                {cols.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-2 font-medium" title={label(c)}>
                    {c}
                  </th>
                ))}
                <th className="px-2 py-2 font-medium">Problèmes</th>
              </tr>
            </thead>
            <tbody>
              {report.raw_rows.map((r) => {
                const rowNum = Number(r._row);
                const rowIssues = byRow.get(rowNum) ?? [];
                const hasError = rowIssues.some((i) => i.severity === "error");
                return (
                  <tr key={rowNum} className={cx("border-t border-hairline", hasError && "bg-[#fdf3f3]")}>
                    <td className="px-2 py-1.5 tabular-nums text-ink-muted">{rowNum}</td>
                    {cols.map((c) => {
                      const issue = byCell.get(`${rowNum}:${c}`);
                      const v = r[c];
                      return (
                        <td
                          key={c}
                          title={issue?.message}
                          className={cx(
                            "whitespace-nowrap px-2 py-1.5 tabular-nums",
                            issue?.severity === "error" && "bg-[#fbe4e4] font-medium text-[#a12626] ring-1 ring-inset ring-band-bad",
                            issue?.severity === "warning" && "bg-[#fff3d6] text-[#7a5200]",
                            (v === null || v === undefined || v === "") && !issue && "text-ink-muted",
                          )}
                        >
                          {v === null || v === undefined || v === "" ? "—" : String(v)}
                        </td>
                      );
                    })}
                    <td className="min-w-[16rem] px-2 py-1.5 text-ink-2">
                      {rowIssues.length === 0 ? <span className="text-[#006300]">OK</span> : rowIssues.map((i, n) => <div key={n}>{i.message}</div>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { FileDown, Printer } from "lucide-react";
import { download } from "@/lib/api";
import { useAnalytics } from "./analytics";

/** Header actions shared by the analysis pages (maquette): custom-weights chip, year switch, exports. */
export function PageActions({ exports = true }: { exports?: boolean }) {
  const { isCustom, resetWeights, overview, period, setPeriod, weightsParam, ttype } = useAnalytics();
  const periods = overview?.periods ?? [];
  const current = period ?? overview?.period ?? null;

  const exportCsv = () => {
    const q = new URLSearchParams({ weights: weightsParam });
    if (current) q.set("period", String(current));
    if (ttype) q.set("territory_type", ttype);
    void download(`/api/analytics/export.csv?${q}`, "wellness.csv");
  };

  return (
    <>
      {isCustom && (
        <span className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-accent-soft pl-3.5 pr-1.5 text-[13px] font-medium text-accent-text">
          Pondération personnalisée
          <button onClick={resetWeights} className="h-[30px] rounded-[7px] bg-white px-2.5 text-xs font-semibold text-accent-text hover:bg-[#F6F7FE]">
            Réinitialiser
          </button>
        </span>
      )}
      {periods.length > 1 && (
        <div className="seg" role="group" aria-label="Année">
          {periods.map((p) => (
            <button key={p} aria-pressed={p === current} onClick={() => setPeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      {exports && (
        <>
          <button onClick={exportCsv} className="secondary-btn no-print" disabled={!overview?.territories.length}>
            <FileDown className="h-4 w-4" aria-hidden /> Exporter CSV
          </button>
          <button onClick={() => window.print()} className="secondary-btn no-print">
            <Printer className="h-4 w-4" aria-hidden /> PDF
          </button>
        </>
      )}
    </>
  );
}

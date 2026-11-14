"use client";

import { Check, CircleCheck } from "lucide-react";

/** 10-class sequential ramp (light → dark), City Health Dashboard style. Darker = higher value. */
export const SEQ_RAMP = ["#e4eef2", "#cfe0e7", "#b9d1dc", "#a3c3d1", "#8db4c6", "#77a5bb", "#6197b0", "#4b88a5", "#2f7a9b", "#006b8f"];
const CITY = "#E59A1B";
const AVG = "#1C2B5A";

export function seqColor(v: number | null | undefined, min: number, max: number) {
  if (v == null || Number.isNaN(v)) return null;
  const t = max > min ? (v - min) / (max - min) : 0.5;
  return SEQ_RAMP[Math.min(SEQ_RAMP.length - 1, Math.max(0, Math.floor(t * SEQ_RAMP.length)))];
}

const pos = (v: number, min: number, max: number) => (max > min ? Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100)) : 50);

/**
 * Scale bar: 10 classes between min and max, the selected territory's value (orange bar)
 * and the average of the dashboard's territories (navy triangle).
 */
export function ScaleBar({
  min,
  max,
  value,
  average,
  better,
  format,
}: {
  min: number;
  max: number;
  value: number | null;
  average: number | null;
  better: "low" | "high" | null;
  format: (v: number) => string;
}) {
  const hint = better && (
    <div className="flex items-center gap-2 text-right text-xs leading-tight text-ink-2">
      <span className="max-w-[92px]">{better === "low" ? "Valeurs basses = meilleurs résultats" : "Valeurs hautes = meilleurs résultats"}</span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[#1C2B5A] text-[#1C2B5A]" aria-hidden>
        <Check className="h-5 w-5" strokeWidth={2.5} />
      </span>
    </div>
  );
  return (
    <div className="flex items-center gap-3">
      {better === "low" && hint}
      <span className="num shrink-0 text-base text-ink-2">{format(min)}</span>
      <div className="relative flex-1 pb-8 pt-7">
        <div className="flex h-8 overflow-hidden" role="img" aria-label={`Échelle de ${format(min)} à ${format(max)}`}>
          {SEQ_RAMP.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>
        {value != null && (
          <>
            <span className="absolute top-0 -translate-x-1/2 text-base font-bold text-[#3A3D44]" style={{ left: `${pos(value, min, max)}%` }}>
              {format(value)}
            </span>
            <span className="absolute top-[24px] h-11 w-[10px] -translate-x-1/2 rounded-[2px] border-2 border-white" style={{ left: `${pos(value, min, max)}%`, background: CITY }} aria-hidden />
          </>
        )}
        {average != null && (
          <>
            <span
              className="absolute top-[62px] h-0 w-0 -translate-x-1/2 border-x-[7px] border-b-[11px] border-x-transparent"
              style={{ left: `${pos(average, min, max)}%`, borderBottomColor: AVG }}
              aria-hidden
            />
            <span className="num absolute top-[76px] -translate-x-1/2 text-base font-bold text-[#3A3D44]" style={{ left: `${pos(average, min, max)}%` }}>
              {format(average)}
            </span>
          </>
        )}
      </div>
      <span className="num shrink-0 text-base text-ink-2">{format(max)}</span>
      {better === "high" && hint}
    </div>
  );
}

export function ScaleLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[#3A3D44] pt-4 text-[13px] text-ink-2">
      <span className="inline-flex items-center gap-2.5">
        <span className="h-6 w-[7px] rounded-[2px]" style={{ background: CITY }} aria-hidden />
        Valeur de la ville
      </span>
      <span className="inline-flex items-center gap-2.5">
        <span className="h-0 w-0 border-x-[7px] border-b-[11px] border-x-transparent" style={{ borderBottomColor: AVG }} aria-hidden />
        Moyenne des villes du tableau de bord
      </span>
      <span className="inline-flex items-center gap-2.5">
        <Check className="h-4 w-4 text-[#2E9F48]" strokeWidth={3} aria-hidden />
        Affiché quand la valeur est meilleure que la moyenne
      </span>
      <span className="inline-flex items-center gap-2.5">
        <CircleCheck className="h-5 w-5 text-[#1C2B5A]" aria-hidden />
        Meilleurs résultats
      </span>
    </div>
  );
}

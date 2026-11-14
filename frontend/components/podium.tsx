"use client";

import { Trophy } from "lucide-react";
import { BandBadge } from "@/components/ui";
import type { BandCode } from "@/lib/types";

export interface PodiumEntry {
  code: string;
  name: string;
  sub?: string | null;
  score: number | null;
  band: BandCode | null;
}

// Decorative medal tones (paired with the 1/2/3 number, never colour alone).
const MEDAL = [
  { bg: "#F3E3A8", ring: "#C9A227", text: "#6B5310", label: "1er" },
  { bg: "#E6E7EA", ring: "#A3A7AF", text: "#40434A", label: "2e" },
  { bg: "#F0D9C4", ring: "#B87333", text: "#6A3B12", label: "3e" },
];
/** Small medal for ranks 1–3 in tables. */
export function MedalRank({ rank }: { rank: number }) {
  const m = MEDAL[rank - 1];
  return (
    <span className="num inline-grid h-6 w-6 place-items-center rounded-full text-xs font-bold" style={{ background: m.bg, color: m.text }} aria-label={`${m.label} place`}>
      {rank}
    </span>
  );
}

// Display order: 2nd, 1st, 3rd — the winner in the middle, on the highest step.
const ORDER = [1, 0, 2];
const STEP_H = ["h-28", "h-20", "h-14"];

export function Podium({ entries, onOpen }: { entries: PodiumEntry[]; onOpen: (code: string) => void }) {
  if (!entries.length) return null;
  return (
    <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4" aria-label="Podium">
      {ORDER.map((i) => {
        const e = entries[i];
        if (!e) return <li key={i} aria-hidden />;
        const m = MEDAL[i];
        return (
          <li key={e.code} className="flex min-w-0 flex-col items-center text-center">
            <button onClick={() => onOpen(e.code)} className="group flex w-full min-w-0 flex-col items-center gap-1.5 rounded-xl px-1 pb-3 hover:bg-plane">
              {i === 0 && <Trophy className="h-5 w-5" style={{ color: m.ring }} aria-hidden />}
              <span
                className="num grid h-11 w-11 place-items-center rounded-full text-[15px] font-bold"
                style={{ background: m.bg, color: m.text, boxShadow: `0 0 0 2px ${m.ring}` }}
                aria-label={`${m.label} place`}
              >
                {i + 1}
              </span>
              <span className="w-full truncate text-[15px] font-semibold text-ink group-hover:underline">{e.name}</span>
              {e.sub && <span className="w-full truncate text-xs text-ink-muted">{e.sub}</span>}
              <BandBadge band={e.band} score={e.score} />
            </button>
            <div
              className={`${STEP_H[i]} w-full rounded-t-xl border border-b-0 border-hairline`}
              style={{ background: `linear-gradient(180deg, ${m.bg} 0%, #FFFFFF 100%)` }}
              aria-hidden
            />
          </li>
        );
      })}
    </ol>
  );
}

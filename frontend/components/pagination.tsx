"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui";

export const PAGE_SIZES = [10, 25, 50];

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
function pageList(page: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  noun = "territoires",
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const btn = "inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm";

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <p className="text-ink-muted">
        <span className="num font-medium text-ink">
          {from}–{to}
        </span>{" "}
        sur <span className="num">{total}</span> {noun}
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button className={cx(btn, "text-ink-2 hover:bg-hover disabled:opacity-40")} onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Page précédente">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pageList(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1 text-ink-faint">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={cx(btn, "num", p === page ? "bg-ink font-semibold text-white" : "text-ink-2 hover:bg-hover")}
              >
                {p}
              </button>
            ),
          )}
          <button className={cx(btn, "text-ink-2 hover:bg-hover disabled:opacity-40")} onClick={() => onPage(page + 1)} disabled={page === pages} aria-label="Page suivante">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <label className="flex items-center gap-2 text-ink-muted">
        Par page
        <select className="input h-9 w-auto py-0" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}

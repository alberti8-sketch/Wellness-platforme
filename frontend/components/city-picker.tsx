"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { BAND_META, fmt } from "@/lib/bands";
import { TYPE_LABEL } from "@/lib/metrics";
import { MAX_COMPARE, useAnalytics } from "./analytics";
import { cx } from "./ui";

/**
 * Drop-down list of cities with checkboxes and a « Valider » button.
 * Choices are a draft until validated; validating replaces the comparison and calls onValidate.
 */
export function CityPicker({ onValidate, align = "left" }: { onValidate?: (codes: string[]) => void; align?: "left" | "right" }) {
  const { territories, compare, setCompareList } = useAnalytics();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(compare);
  const [q, setQ] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Start each opening from the current comparison.
  useEffect(() => {
    if (open) {
      setDraft(compare);
      setQ("");
    }
  }, [open, compare]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const filtered = territories.filter((t) => !q || norm(t.name).includes(norm(q)));
  const groups = [...new Set(filtered.map((t) => t.context.territory_type ?? ""))].map((ty) => ({
    ty,
    items: filtered.filter((t) => (t.context.territory_type ?? "") === ty).sort((a, b) => a.name.localeCompare(b.name, "fr")),
  }));
  const full = draft.length >= MAX_COMPARE;
  const toggle = (code: string) => setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code) : full ? d : [...d, code]));
  const validate = () => {
    setCompareList(draft);
    setOpen(false);
    onValidate?.(draft);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={listId}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink hover:bg-[#F0F0EB]"
      >
        Villes à comparer
        <span className="num inline-grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-white">{compare.length}</span>
        <ChevronDown className={cx("h-4 w-4 transition", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div
          id={listId}
          role="dialog"
          aria-label="Choisir les villes à comparer"
          className={cx(
            "absolute z-[1200] mt-2 w-[min(340px,calc(100vw-32px))] rounded-2xl border border-hairline bg-white p-3 shadow-[0_12px_32px_rgba(21,23,28,0.14)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <label className="relative block">
            <span className="sr-only">Rechercher une ville</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input autoFocus className="input h-10 pl-9" placeholder="Rechercher une ville…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <p className="mt-2 px-1 text-xs text-ink-muted">
            {draft.length} sélectionnée(s) · {MAX_COMPARE} maximum
          </p>

          <div className="mt-1 max-h-[320px] overflow-y-auto">
            {groups.map(({ ty, items }) => (
              <fieldset key={ty || "none"} className="mt-2">
                <legend className="px-1 text-xs font-semibold text-ink-muted">{ty ? TYPE_LABEL[ty] : "Autres"}</legend>
                {items.map((t) => {
                  const on = draft.includes(t.code);
                  const disabled = !on && full;
                  return (
                    <label
                      key={t.code}
                      className={cx("mt-0.5 flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-lg px-2 hover:bg-plane", disabled && "cursor-not-allowed opacity-50")}
                    >
                      <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(t.code)} className="h-[18px] w-[18px] accent-[#15171C]" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.name}</span>
                      <span className="num inline-flex items-center gap-1 text-xs text-ink-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: t.composite.band ? BAND_META[t.composite.band].color : "#B9B9B2" }} aria-hidden />
                        {fmt(t.composite.score)}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ))}
            {!filtered.length && <p className="px-2 py-4 text-sm text-ink-muted">Aucune ville ne correspond.</p>}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-hairline pt-3">
            <button type="button" onClick={() => setDraft([])} className="h-10 rounded-xl px-3 text-sm text-ink-2 hover:bg-hover">
              Tout décocher
            </button>
            <button
              type="button"
              onClick={validate}
              disabled={draft.length === 1}
              title={draft.length === 1 ? "Choisissez au moins deux villes" : undefined}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-axis"
            >
              <Check className="h-4 w-4" aria-hidden />
              Valider{draft.length > 1 ? ` (${draft.length})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

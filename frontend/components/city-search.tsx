"use client";

import { Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { TYPE_LABEL } from "@/lib/metrics";
import type { Territory } from "@/lib/types";
import { cx } from "./ui";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Search box over the tracked cities (keyboard: ↑ ↓ Entrée Échap). */
export function CitySearch({
  territories,
  value,
  onPick,
  placeholder = "Rechercher une ville",
}: {
  territories: Territory[];
  value: string | null;
  onPick: (code: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = value ? territories.find((t) => t.code === value) : null;

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const n = norm(q.trim());
  const results = territories
    .filter((t) => !n || norm(t.name).includes(n) || t.code.startsWith(n))
    .sort((a, b) => Number(!norm(a.name).startsWith(n)) - Number(!norm(b.name).startsWith(n)) || a.name.localeCompare(b.name))
    .slice(0, 8);

  const pick = (t: Territory) => {
    onPick(t.code);
    setQ("");
    setOpen(false);
  };

  return (
    <div ref={box} className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={placeholder}
        className="input h-10 w-full pl-9"
        placeholder={current ? current.name : placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter" && open && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-xl border border-hairline bg-white py-1 shadow-[0_12px_32px_rgba(21,23,28,0.12)]">
          {results.map((t, i) => (
            <li key={t.code} role="option" aria-selected={i === active}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(t)}
                className={cx("flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm", i === active && "bg-plane", t.code === value && "font-semibold")}
              >
                <span className="text-ink">{t.name}</span>
                <span className="text-xs text-ink-muted">{t.context.territory_type ? TYPE_LABEL[t.context.territory_type] : t.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

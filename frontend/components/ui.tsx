"use client";

import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BAND_META, STATUS_LABEL, fmt } from "@/lib/bands";
import type { BandCode } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-hairline bg-surface shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({ variant = "primary", icon: Icon, loading, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-brand text-white hover:bg-brand-700 disabled:bg-axis",
    secondary: "border border-axis bg-white text-ink hover:bg-plane disabled:text-ink-muted",
    danger: "bg-band-bad text-white hover:brightness-95 disabled:bg-axis",
    ghost: "text-ink-2 hover:bg-plane",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed", styles[variant], className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

const BAND_ICON: Record<BandCode, LucideIcon> = { best: CheckCircle2, middle: MinusCircle, bad: AlertTriangle };

/** Band = colour + icon + label (never colour alone). */
export function BandBadge({ band, score, size = "sm" }: { band: BandCode | null; score?: number | null; size?: "sm" | "lg" }) {
  if (!band) return <span className="inline-flex items-center rounded-full bg-plane px-2 py-0.5 text-xs text-ink-muted">Non calculé</span>;
  const m = BAND_META[band];
  const Icon = BAND_ICON[band];
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full font-medium", size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs")}
      style={{ background: m.tint, color: m.text }}
    >
      <Icon className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} style={{ color: m.color }} aria-hidden />
      {score !== undefined && <span className="tabular-nums">{fmt(score)}</span>}
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PUBLISHED"
      ? "bg-[#e3f5e3] text-[#006300]"
      : status === "REJECTED" || status === "FAILED"
        ? "bg-[#fbe4e4] text-[#a12626]"
        : status === "PENDING_APPROVAL"
          ? "bg-[#fff3d6] text-[#7a5200]"
          : "bg-brand-50 text-brand";
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-ink-2">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-[#f3c4c4] bg-[#fbe4e4] px-4 py-3 text-sm text-[#a12626]">{children}</div>;
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-ink-muted" />
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function BandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
      {(["best", "middle", "bad"] as BandCode[]).map((b) => (
        <span key={b} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: BAND_META[b].color }} />
          {BAND_META[b].label} <span className="text-ink-muted">({BAND_META[b].range})</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-3 rounded-sm bg-band-none" /> Pas de donnée
      </span>
    </div>
  );
}

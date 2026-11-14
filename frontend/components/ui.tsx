"use client";

import { Loader2, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { BAND_META, STATUS_LABEL, fmt } from "@/lib/bands";
import type { BandCode } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/** White section card (maquette: radius 16, hairline border, 20px padding). */
export function Card({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-card border border-hairline bg-white p-5", className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-1 text-[13px] text-ink-muted">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
export function Button({
  variant = "primary",
  icon: Icon,
  loading,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: LucideIcon; loading?: boolean }) {
  const styles: Record<Variant, string> = {
    primary: "bg-primary text-white hover:bg-brand-700 disabled:bg-axis",
    secondary: "border border-line bg-white text-ink hover:bg-[#F0F0EB] disabled:text-ink-faint",
    danger: "bg-danger text-white hover:brightness-95 disabled:bg-axis",
    ghost: "text-ink-2 hover:bg-hover",
  };
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed",
        styles[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/** Band chip: tinted pill + coloured dot + label (colour never alone). */
export function BandBadge({ band, score, size = "sm" }: { band: BandCode | null; score?: number | null; size?: "sm" | "lg" }) {
  if (!band) {
    return <span className="inline-flex h-[26px] items-center rounded-full bg-[#EFEFEA] px-2.5 text-xs font-semibold text-ink-2">Pas de données</span>;
  }
  const m = BAND_META[band];
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", size === "lg" ? "h-8 px-3 text-sm" : "h-[26px] px-2.5 text-xs")}
      style={{ background: m.tint, color: m.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.color }} aria-hidden />
      {score !== undefined && <span className="num">{fmt(score)}</span>}
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "PUBLISHED"
      ? "bg-[#DDF0EA] text-[#0E5A50]"
      : status === "REJECTED" || status === "FAILED"
        ? "bg-[#FBE6DF] text-[#9A2F1C]"
        : status === "PENDING_APPROVAL"
          ? "bg-[#F6EDD3] text-[#6E5110]"
          : "bg-accent-soft text-accent-text";
  return <span className={cx("inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold", tone)}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Spinner({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-ink-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-xl border border-[#F0C9BD] bg-[#FBE6DF] px-4 py-3 text-sm text-[#9A2F1C]">
      {children}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-ink-faint" />
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="max-w-md text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function BandLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
      {(["best", "middle", "bad"] as BandCode[]).map((b) => (
        <span key={b} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: BAND_META[b].color }} />
          {BAND_META[b].label} <span className="text-ink-faint">({BAND_META[b].range})</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-band-none" /> Pas de donnée
      </span>
    </div>
  );
}

/** Page header (maquette): 28px title, muted subtitle, actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold tracking-[-0.025em] text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Horizontal score bar 0–10 (dimension rows). */
export function ScoreBar({ score, color, height = 6 }: { score: number | null | undefined; color: string; height?: number }) {
  return (
    <div className="overflow-hidden rounded-full bg-[#EEEEE9]" style={{ height }}>
      <div className="h-full rounded-full" style={{ width: `${score != null ? Math.max(0, Math.min(100, (score / 10) * 100)) : 0}%`, background: color }} />
    </div>
  );
}

export function Kpi({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-card border border-hairline bg-white p-5">
      <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} aria-hidden />}
        {label}
      </p>
      <p className="num mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{value}</p>
      {sub && <div className="mt-2 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

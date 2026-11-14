"use client";

import { Activity, LayoutDashboard, ShieldCheck, Upload, Workflow } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DEMO_ACCOUNTS, useSession } from "./session";
import { ErrorBox, cx } from "./ui";

const NAV = [
  { href: "/collect", label: "Collecte", icon: Upload },
  { href: "/processing", label: "Traitement", icon: Workflow },
  { href: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { apiKey, setApiKey, me, error } = useSession();

  return (
    <div className="flex min-h-screen flex-col bg-plane md:flex-row">
      <aside className="no-print flex shrink-0 flex-col border-b border-hairline bg-brand text-white md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-5 py-4">
          <Activity className="h-6 w-6" />
          <div>
            <p className="text-sm font-semibold leading-tight">Wellness Platform</p>
            <p className="text-xs text-white/70">Biobanque comportementale</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition",
                pathname?.startsWith(href) ? "bg-white/15 font-medium" : "text-white/80 hover:bg-white/10",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden px-5 py-4 text-xs text-white/60 md:block">
          <ShieldCheck className="mb-1 h-4 w-4" />
          Données agrégées uniquement. Isolation stricte par tenant.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3 md:px-6">
          <div className="min-w-0 text-sm">
            {me ? (
              <>
                <span className="font-medium text-ink">{me.tenant.name}</span>
                <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand">{me.tenant.stakeholder_type}</span>
                <span className="ml-2 text-ink-2">
                  {me.name} · {me.role}
                </span>
              </>
            ) : (
              <span className="text-ink-muted">Connexion…</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-2">
            Compte de démo
            <select value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="rounded-md border border-axis bg-white px-2 py-1 text-sm text-ink">
              {DEMO_ACCOUNTS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </header>
        <main className="flex-1 p-4 md:p-6">
          {error && <ErrorBox>{error}</ErrorBox>}
          {children}
        </main>
      </div>
    </div>
  );
}

"use client";

import { Activity, Database, GitCompareArrows, LogOut, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAnalytics } from "./analytics";
import { STEPS } from "@/lib/steps";
import { DEMO_ACCOUNTS, useSession } from "./session";
import { TerritoryDrawer } from "./territory-drawer";
import { ErrorBox, cx } from "./ui";

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function CompareTray() {
  const { compare, byCode, toggleCompare, clearCompare } = useAnalytics();
  const pathname = usePathname();
  if (!compare.length || pathname?.startsWith("/classement")) return null;
  return (
    <div className="no-print fixed inset-x-0 bottom-4 z-[1050] flex justify-center px-4">
      <div className="flex max-w-full flex-wrap items-center gap-2 rounded-2xl bg-primary px-3 py-2.5 text-white shadow-[0_8px_30px_rgba(21,23,28,0.25)]">
        <GitCompareArrows className="ml-1 h-4 w-4 text-white/70" aria-hidden />
        <span className="text-[13px] text-white/80">Comparaison</span>
        {compare.map((c) => (
          <span key={c} className="inline-flex h-8 items-center gap-1 rounded-full bg-white/10 pl-3 pr-1 text-[13px] font-medium">
            {byCode[c]?.name ?? c}
            <button onClick={() => toggleCompare(c)} aria-label={`Retirer ${byCode[c]?.name ?? c} de la comparaison`} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white/15">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <Link href="/classement#comparaison" className="inline-flex h-9 items-center rounded-xl bg-white px-3.5 text-[13px] font-semibold text-ink hover:bg-[#F0F0EB]">
          Comparer {compare.length > 1 ? `(${compare.length})` : ""}
        </Link>
        <button onClick={clearCompare} className="h-9 rounded-xl px-2.5 text-[13px] text-white/75 hover:bg-white/10">
          Vider
        </button>
      </div>
    </div>
  );
}

function GlobalDrawer() {
  const { selected, byCode, open, rankOf, territories, weights } = useAnalytics();
  const { catalog } = useSession();
  const t = selected ? byCode[selected] : null;
  if (!t || !catalog || !weights) return null;
  return <TerritoryDrawer territory={t} rank={rankOf(t.code)} total={territories.length} catalog={catalog} weights={weights} onClose={() => open(null)} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { apiKey, setApiKey, me, error, loggedIn, authReady, logout } = useSession();
  const router = useRouter();
  const isLanding = pathname === "/";

  // Demo sign-in gate: the app pages need a signed-in user; the landing page is public.
  useEffect(() => {
    if (authReady && !loggedIn && !isLanding) router.replace("/");
  }, [authReady, loggedIn, isLanding, router]);

  if (isLanding) return <>{children}</>;
  if (!authReady || !loggedIn) return <div className="min-h-screen bg-plane" aria-busy="true" />;

  return (
    <div className="flex min-h-screen flex-wrap bg-plane">
      <aside aria-label="Navigation principale" className="no-print flex max-w-full flex-[1_1_240px] flex-col gap-7 border-b border-hairline bg-white px-4 py-6 md:sticky md:top-0 md:h-screen md:max-w-[260px] md:border-b-0 md:border-r">
        <Link href="/dashboard" className="flex items-center gap-3 px-2">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-primary text-white" aria-hidden>
            <Activity className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-[-0.01em] text-ink">Wellness</span>
            <span className="block text-xs text-ink-muted">Santé populationnelle</span>
          </span>
        </Link>

        <nav aria-label="Étapes" className="flex flex-wrap gap-1 md:flex-col">
          {STEPS.map(({ href, label, hint }, i) => {
            const on = pathname?.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={cx("flex min-h-[52px] items-center gap-3 rounded-xl px-3 transition", on ? "bg-primary text-white" : "text-ink hover:bg-hover")}
              >
                <span
                  className={cx("num grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold", on ? "bg-white text-ink" : "bg-plane text-ink-2")}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className={cx("hidden text-xs md:block", on ? "text-white/70" : "text-ink-muted")}>{hint}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {me && me.role !== "viewer" && (
            <Link
              href="/collect"
              className={cx(
                "inline-flex min-h-[40px] items-center gap-2 rounded-[10px] px-3 text-[13px] transition",
                pathname?.startsWith("/collect") || pathname?.startsWith("/processing") ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover",
              )}
            >
              <Database className="h-4 w-4" aria-hidden /> Gérer les données
            </Link>
          )}
          <div className="flex items-center gap-2.5 px-2">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-hairline text-xs font-semibold text-ink">
              {me ? initials(me.name) : "··"}
            </span>
            <div className="min-w-0 text-[13px] leading-tight">
              <p className="truncate font-medium text-ink">{me?.name ?? "Connexion…"}</p>
              <p className="truncate text-ink-muted">{me ? `${me.tenant.stakeholder_type} · ${me.role}` : ""}</p>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/");
            }}
            className="mx-2 inline-flex h-10 items-center gap-2 rounded-[10px] px-2 text-[13px] text-ink-2 hover:bg-hover"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Se déconnecter
          </button>
          <details className="px-2 text-xs text-ink-muted">
            <summary className="cursor-pointer select-none py-1 hover:text-ink">Changer de compte (démo)</summary>
            <select
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              aria-label="Compte de démo"
              className="mt-1.5 h-10 w-full rounded-[10px] border border-line bg-white px-2 text-[13px] text-ink"
            >
              {DEMO_ACCOUNTS.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </details>
        </div>
      </aside>

      <main className="min-w-0 flex-[999_1_560px] px-4 pb-24 pt-7 md:px-8">
        <div className="mx-auto max-w-[1320px]">
          {error && (
            <div className="mb-4">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
          {children}
        </div>
      </main>

      <GlobalDrawer />
      <CompareTray />
    </div>
  );
}

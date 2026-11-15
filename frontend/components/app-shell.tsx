"use client";

import { Activity, Database, LayoutGrid, Lightbulb, LogOut, Map, Network, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAnalytics } from "./analytics";
import { CITY_PAGES, STEPS } from "@/lib/steps";
import { DEMO_ACCOUNTS, useSession } from "./session";
import { TerritoryDrawer } from "./territory-drawer";
import { ErrorBox, cx } from "./ui";

const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutGrid,
  "/assistant": Lightbulb,
  "/carte": Map,
  "/prediction": Network,
};

function initials(name: string) {
  return name
    .replace(/\(.*?\)/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
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
  const { apiKey, setApiKey, me, error, loggedIn, authReady, logout, account } = useSession();
  const router = useRouter();
  const isLanding = pathname === "/" || (pathname?.startsWith("/connexion") ?? false) || (pathname?.startsWith("/rapport/pdf") ?? false);
  // Current commune (?ville=), kept when moving between the commune pages; the account's commune by default.
  const [ville, setVille] = useState<string | null>(null);
  useEffect(() => {
    try {
      setVille(new URLSearchParams(window.location.search).get("ville"));
    } catch {
      /* no URL access */
    }
  }, [pathname]);
  const cityCode = ville ?? account?.city_code ?? null;
  // Full-screen pages (map with floating panels, chat), the other pages use the centred column.
  const fullBleed = (pathname?.startsWith("/carte") || pathname?.startsWith("/assistant")) ?? false;

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

        <nav aria-label="Navigation" className="flex flex-wrap gap-1 md:flex-col">
          {STEPS.map(({ href, label }) => {
            const on = pathname?.startsWith(href);
            const Icon = ICONS[href];
            return (
              <Link
                key={href}
                href={CITY_PAGES.has(href) && cityCode ? `${href}?ville=${cityCode}` : href}
                aria-current={on ? "page" : undefined}
                className={cx("flex min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-sm transition", on ? "bg-primary font-medium text-white" : "text-[#3A3D44] hover:bg-hover")}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {label}
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
              {account ? account.email.slice(0, 2).toUpperCase() : me ? initials(me.name) : "··"}
            </span>
            <div className="min-w-0 text-[13px] leading-tight">
              <p className="truncate font-medium text-ink">{account?.email ?? me?.name ?? "Connexion…"}</p>
              <p className="truncate text-ink-muted">
                {account ? [account.job, account.city_name].filter(Boolean).join(" · ") : me ? `${me.tenant.stakeholder_type} · ${me.role}` : ""}
              </p>
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
          {!account && (
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
          )}
        </div>
      </aside>

      <main className={`relative isolate min-w-0 flex-[999_1_560px] ${fullBleed ? "" : "px-4 pb-24 pt-7 md:px-8"}`}>
        {/* Full-width cover photo of a page (filled by <PageCover>). */}
        <div id="page-cover" className="no-print pointer-events-none absolute inset-x-0 top-0 -z-10" aria-hidden />
        <div className={fullBleed ? "" : "mx-auto max-w-[1320px]"}>
          {error && (
            <div className="mb-4">
              <ErrorBox>{error}</ErrorBox>
            </div>
          )}
          {children}
        </div>
      </main>

      <GlobalDrawer />
    </div>
  );
}

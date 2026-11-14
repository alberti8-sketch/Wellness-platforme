"use client";

import { Activity, ArrowRight, GitCompareArrows, Map, Network } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FranceSilhouette } from "@/components/france-silhouette";
import { useSession } from "@/components/session";

const FEATURES = [
  { icon: Map, label: "Carte des villes" },
  { icon: GitCompareArrows, label: "Comparer" },
  { icon: Network, label: "Prédire les maladies" },
];

/** Public landing page (signed-out). Signed-in users go straight to the app. */
export default function LandingPage() {
  const { loggedIn, authReady, login } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (authReady && loggedIn) router.replace("/dashboard");
  }, [authReady, loggedIn, router]);

  const signIn = () => {
    login();
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen flex-col bg-plane">
      <header className="flex items-center justify-between px-5 py-5 md:px-10">
        <span className="flex items-center gap-3">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-primary text-white" aria-hidden>
            <Activity className="h-[18px] w-[18px]" />
          </span>
          <span className="text-base font-semibold tracking-[-0.01em] text-ink">Wellness</span>
        </span>
        <button onClick={signIn} className="secondary-btn h-10">
          Se connecter
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-10 px-5 pb-12 md:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <span className="inline-flex h-7 items-center rounded-full border border-hairline bg-white px-3 text-xs font-medium text-ink-2">Santé populationnelle · démo</span>
          <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[56px]">
            La santé de vos territoires, en un coup d'œil.
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-muted">Comparez les villes et anticipez les maladies chroniques.</p>

          <button onClick={signIn} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white hover:bg-brand-700">
            Se connecter <ArrowRight className="h-4 w-4" aria-hidden />
          </button>

          <ul className="mt-10 flex flex-wrap gap-2">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex h-10 items-center gap-2 rounded-full border border-hairline bg-white pl-3 pr-4 text-sm text-ink">
                <Icon className="h-4 w-4 text-ink-2" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto w-full max-w-[520px]">
          <FranceSilhouette />
          <div className="absolute bottom-0 left-0 hidden w-[200px] rounded-2xl border border-hairline bg-white p-4 shadow-[0_12px_32px_rgba(21,23,28,0.10)] sm:block" aria-hidden>
            <p className="text-xs text-ink-muted">Indice de bien-être</p>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full">
              <span className="flex-[3] bg-[#F6D3C8]" />
              <span className="flex-[3] bg-[#F1E4BF]" />
              <span className="flex-[3] bg-[#C6E4DA]" />
            </div>
            <div className="mt-3 space-y-2">
              {[78, 62, 45].map((w, i) => (
                <div key={i} className="h-1.5 rounded-full bg-[#EEEEE9]">
                  <div className="h-full rounded-full bg-[#1F8A78]" style={{ width: `${w}%`, opacity: 1 - i * 0.25 }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="px-5 pb-6 text-center text-xs text-ink-faint md:px-10">Données publiques agrégées · Assurance Maladie · INSEE · IGN · OpenStreetMap</footer>
    </div>
  );
}

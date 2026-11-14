"use client";

import { Activity, ArrowRight, Columns2, MapPin, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/session";
import { BAND_META } from "@/lib/bands";
import type { BandCode } from "@/lib/types";

const FEATURES = [
  { icon: MapPin, title: "Situez chaque ville", text: "Sur une carte de France : marche, vélo, alimentation, sport et santé." },
  { icon: Columns2, title: "Comparez-les", text: "Jusqu'à 4 villes côte à côte, thème par thème, et le podium des meilleures." },
  { icon: TrendingUp, title: "Anticipez les maladies", text: "Estimez le diabète à partir du profil d'une ville." },
];

// Static preview of a city sheet (demo values of Annecy, as shown in the app).
const PREVIEW: { name: string; type: string; score: string; band: BandCode; rank: string; dims: [string, number, BandCode][] } = {
  name: "Annecy",
  type: "Ville",
  score: "7,9",
  band: "best",
  rank: "2ᵉ sur 14 villes suivies",
  dims: [
    ["Sport", 9, "best"],
    ["Environnement", 7.8, "best"],
    ["Offre de soins", 8.7, "best"],
    ["Social", 4.2, "middle"],
  ],
};

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
  const band = BAND_META[PREVIEW.band];

  return (
    <div className="flex min-h-screen flex-col bg-plane text-ink">
      <header className="px-5 py-6 md:px-12">
        <div className="mx-auto flex max-w-[1180px] items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-ink text-white" aria-hidden>
            <Activity className="h-[18px] w-[18px]" />
          </span>
          <span className="text-lg font-semibold">Wellness</span>
        </div>
      </header>

      <main className="flex-1 px-5 pb-12 pt-8 md:px-12">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-14">
          <div className="flex flex-wrap items-center gap-12">
            <div className="flex min-w-0 flex-[1_1_420px] flex-col items-start gap-6">
              <span className="rounded-full border border-hairline bg-white px-3 py-1 text-[13px] text-ink-muted">Démo · santé des territoires</span>
              <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.025em] md:text-[56px]">La santé de vos villes, en un coup d&apos;œil.</h1>
              <p className="max-w-[480px] text-[17px] text-ink-muted md:text-[19px]">
                Un indice de bien-être de 1 à 10 pour chaque ville, pour la comparer aux autres et anticiper les maladies chroniques.
              </p>
              <button onClick={signIn} className="inline-flex h-[52px] items-center gap-2.5 rounded-xl bg-ink px-6 font-semibold text-white hover:bg-black">
                Se connecter <ArrowRight className="h-[18px] w-[18px]" aria-hidden />
              </button>
            </div>

            <figure
              aria-label="Aperçu de l'application"
              className="flex min-w-0 flex-[1_1_420px] flex-col gap-5 rounded-[20px] border border-hairline bg-white p-7 shadow-[0_24px_48px_-32px_rgba(21,23,28,0.25)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-ink-muted">
                    {PREVIEW.name} · {PREVIEW.type}
                  </span>
                  <span className="flex items-baseline gap-2">
                    <span className="num text-[44px] font-semibold leading-none">{PREVIEW.score}</span>
                    <span className="text-ink-muted">/ 10</span>
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold" style={{ background: band.tint, color: band.text }}>
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: band.color }} aria-hidden />
                  {band.label}
                </span>
              </div>
              <ul className="flex flex-col gap-3 text-sm">
                {PREVIEW.dims.map(([label, v, b]) => (
                  <li key={label} className="grid grid-cols-[120px_minmax(0,1fr)_32px] items-center gap-3">
                    <span>{label}</span>
                    <span className="h-2 rounded-full bg-[#EEEEE9]">
                      <span className="block h-2 rounded-full" style={{ width: `${v * 10}%`, background: BAND_META[b].color }} />
                    </span>
                    <b className="num text-right font-semibold">{v.toLocaleString("fr-FR")}</b>
                  </li>
                ))}
              </ul>
              <figcaption className="text-[13px] text-ink-muted">{PREVIEW.rank}</figcaption>
            </figure>
          </div>

          <ul className="grid gap-4 md:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex flex-col gap-2 rounded-2xl border border-hairline bg-white p-6">
                <Icon className="h-[22px] w-[22px]" strokeWidth={1.8} aria-hidden />
                <h2 className="text-[17px] font-semibold">{title}</h2>
                <p className="text-[15px] text-ink-muted">{text}</p>
              </li>
            ))}
          </ul>
        </div>
      </main>

      <footer className="px-5 pb-7 pt-5 text-center text-[13px] text-ink-muted md:px-12">
        Données publiques agrégées · Assurance Maladie · INSEE · SIRENE · Vélo &amp; Territoires · Baromètre des villes marchables
      </footer>
    </div>
  );
}

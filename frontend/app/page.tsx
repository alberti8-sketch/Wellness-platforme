"use client";

import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Database,
  LayoutGrid,
  Lock,
  Map,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAnalytics } from "@/components/analytics";
import { useSession } from "@/components/session";
import { cx } from "@/components/ui";

const STEPS: { icon: LucideIcon; title: string; text: string; href: string; cta: string }[] = [
  {
    icon: Upload,
    title: "Collecter",
    text: "Déposez des indicateurs agrégés par territoire (Excel ou saisie manuelle). Le schéma est contrôlé avant l'envoi.",
    href: "/collect",
    cta: "Déposer des données",
  },
  {
    icon: Workflow,
    title: "Valider",
    text: "Un pipeline déterministe nettoie et note chaque indicateur sur 1–10. Un administrateur relit, corrige et publie.",
    href: "/processing",
    cta: "Suivre le traitement",
  },
  {
    icon: LayoutGrid,
    title: "Analyser",
    text: "Indice de bien-être pondéré, carte, classement et comparaison des territoires, avec l'évolution des maladies.",
    href: "/dashboard",
    cta: "Ouvrir le tableau de bord",
  },
  {
    icon: Network,
    title: "Prédire",
    text: "Un arbre de décision estime la prévalence des maladies chroniques d'une ville à partir de son profil.",
    href: "/prediction",
    cta: "Voir la prédiction",
  },
];

const PAGES: { icon: LucideIcon; title: string; text: string; href: string }[] = [
  { icon: LayoutGrid, title: "Tableau de bord", text: "Synthèse : indice moyen, niveaux, dimensions, évolution du diabète, extrêmes.", href: "/dashboard" },
  { icon: Network, title: "Prédiction maladies", text: "Arbre de décision, chemin d'une ville, simulateur « Et si… ? ».", href: "/prediction" },
  { icon: Map, title: "Carte & graphique", text: "Les villes sur la carte de France, filtres, fast-foods, mode comparaison.", href: "/carte" },
  { icon: BarChart3, title: "Classement", text: "Tableau triable et comparaison de 2 à 4 villes (radar et écarts).", href: "/classement" },
  { icon: SlidersHorizontal, title: "Pondération & méthode", text: "Réglez le poids des dimensions et voyez l'impact ; sources scientifiques.", href: "/ponderation" },
  { icon: Database, title: "Référentiels", text: "Scores sources WP25 et effectifs de l'Assurance Maladie par département.", href: "/villes" },
];

const SOURCES = [
  ["Assurance Maladie", "prévalence des maladies chroniques 2015–2024 (data.ameli.fr), effectifs CNAM"],
  ["INSEE", "taux de pauvreté, population, densité, référentiel des communes"],
  ["SIRENE", "entreprises de restauration rapide (NAF 56.10C)"],
  ["Ministère des Sports", "recensement des équipements sportifs"],
  ["OpenStreetMap", "fast-foods, restaurants et cafés géolocalisés"],
  ["IGN", "fonds de carte et contours administratifs"],
  ["Équipe WP25", "scores Sport, Environnement, Offre de soins des 14 villes"],
];

function Check({ done, title, children, action }: { done: boolean; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex gap-3 border-b border-[#F2F2EE] py-3.5 last:border-0">
      {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#1F8A78]" aria-label="fait" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-axis" aria-label="à faire" />}
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-medium", done ? "text-ink" : "text-ink")}>{title}</p>
        <div className="mt-0.5 text-[13px] text-ink-muted">{children}</div>
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </li>
  );
}

export default function HomePage() {
  const { me, ready, error } = useSession();
  const { territories, overview } = useAnalytics();
  const hasData = territories.length > 0;
  const isAdmin = me?.role === "admin";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-card bg-primary px-6 py-10 text-white md:px-10 md:py-12">
        <p className="text-[13px] font-medium text-white/60">Wellness · Santé populationnelle</p>
        <h1 className="mt-3 max-w-3xl text-[32px] font-semibold leading-tight tracking-[-0.025em] md:text-[40px]">
          La première biobanque de données comportementales, au service de la prévention.
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-white/75">
          Les données comportementales sont aujourd'hui rares et déclaratives. La plateforme réunit des indicateurs objectifs par territoire (sport, environnement, offre de
          soins, précarité, maladies chroniques) pour repérer tôt les facteurs de risque et mieux piloter les politiques de santé.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={hasData ? "/dashboard" : "/collect"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-ink hover:bg-[#F0F0EB]">
            {hasData ? "Explorer le tableau de bord" : "Commencer par déposer des données"} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/prediction" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-medium text-white hover:bg-white/10">
            <Network className="h-4 w-4" aria-hidden /> Voir la prédiction des maladies
          </Link>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* How it works */}
        <section className="rounded-card border border-hairline bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Comment ça marche</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Quatre étapes, des données brutes à la prédiction.</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col rounded-xl bg-plane p-4">
                <div className="flex items-center gap-2.5">
                  <span className="num grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-semibold text-white">{i + 1}</span>
                  <s.icon className="h-4 w-4 text-ink-2" aria-hidden />
                  <h3 className="text-sm font-semibold text-ink">{s.title}</h3>
                </div>
                <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-ink-2">{s.text}</p>
                <Link href={s.href} className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
                  {s.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Getting started (live status) */}
        <section className="rounded-card border border-hairline bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Pour bien démarrer</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Votre progression, mise à jour en direct.</p>
          <ul className="mt-2">
            <Check done={ready && !!me} title="Compte connecté">
              {me ? (
                <>
                  {me.name} · {me.tenant.name} ({me.tenant.stakeholder_type}, {me.role})
                </>
              ) : error ? (
                <>API injoignable : lancez le backend (voir README).</>
              ) : (
                <>Connexion en cours…</>
              )}
            </Check>
            <Check
              done={hasData}
              title="Données publiées"
              action={
                !hasData && (
                  <Link href="/collect" className="secondary-btn h-9 text-[13px]">
                    Déposer
                  </Link>
                )
              }
            >
              {hasData ? (
                <>
                  {territories.length} territoires publiés · {overview?.period}
                </>
              ) : (
                <>
                  Aucune donnée pour ce compte. Démo : <code className="rounded bg-plane px-1">python -m scripts.seed_demo</code> dans <code className="rounded bg-plane px-1">backend/</code>, ou
                  déposez <code className="rounded bg-plane px-1">data/wp25_communes.xlsx</code>.
                </>
              )}
            </Check>
            <Check done={false} title="Ouvrir la fiche d'une ville" action={<Link href="/carte" className="secondary-btn h-9 text-[13px]">Carte</Link>}>
              Sur la carte, cliquez un repère : note, dimensions, évolution des maladies, environnement alimentaire.
            </Check>
            <Check done={false} title="Comparer des villes" action={<Link href="/classement#comparaison" className="secondary-btn h-9 text-[13px]">Comparer</Link>}>
              « Villes à comparer » : cochez 2 à 4 villes puis validez.
            </Check>
            <Check done={false} title="Prédire une maladie" action={<Link href="/prediction" className="secondary-btn h-9 text-[13px]">Prédire</Link>}>
              Choisissez une ville et suivez son chemin dans l'arbre ; testez le simulateur.
            </Check>
            {isAdmin && (
              <Check done={false} title="Ajuster la pondération" action={<Link href="/ponderation" className="secondary-btn h-9 text-[13px]">Régler</Link>}>
                Modifiez le poids des dimensions et observez l'impact sur le classement.
              </Check>
            )}
          </ul>
        </section>
      </div>

      {/* Pages */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">Ce que vous trouverez</h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="group rounded-card border border-hairline bg-white p-5 transition hover:border-axis">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-plane text-ink" aria-hidden>
                <p.icon className="h-[18px] w-[18px]" />
              </span>
              <h3 className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
                {p.title}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden />
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{p.text}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-hairline bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Les données</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Sources publiques et officielles, citées dans chaque écran.</p>
          <ul className="mt-4 divide-y divide-[#F2F2EE]">
            {SOURCES.map(([name, what]) => (
              <li key={name} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-2.5 text-[13px]">
                <span className="font-medium text-ink">{name}</span>
                <span className="text-ink-2">{what}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-card border border-hairline bg-white p-5">
          <h2 className="text-base font-semibold text-ink">Confiance et confidentialité</h2>
          <ul className="mt-4 space-y-4 text-[13px] leading-relaxed text-ink-2">
            <li className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" aria-hidden />
              <span>
                <strong className="font-medium text-ink">Données agrégées uniquement.</strong> Aucune donnée individuelle n'est collectée à ce stade : uniquement des
                indicateurs par territoire.
              </span>
            </li>
            <li className="flex gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-ink" aria-hidden />
              <span>
                <strong className="font-medium text-ink">Isolation par organisation.</strong> Chaque compte (B2B ou B2G) ne voit que ses propres données ; une publication
                passe toujours par la validation d'un administrateur.
              </span>
            </li>
            <li className="flex gap-3">
              <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-ink" aria-hidden />
              <span>
                <strong className="font-medium text-ink">Calculs transparents.</strong> Règles de notation déterministes et auditées, poids sourcés, précision de la
                prédiction mesurée et affichée. Les prédictions décrivent des associations, pas des causes.
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

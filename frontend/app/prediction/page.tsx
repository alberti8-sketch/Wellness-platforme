"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { useSession } from "@/components/session";
import { Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { fmt } from "@/lib/bands";
import { FEATURE_SHORT, fmtFeature } from "@/lib/feature-format";
import {
  simulate,
  useCommunePredictions,
  useModel,
  usePredictions,
  type DiseasePrediction,
  type FeatureKey,
  type PathStep,
  type PredPatho,
} from "@/lib/prediction";

const RANGES: Record<FeatureKey, [number, number, number]> = {
  pct_65plus: [10, 35, 0.5],
  poverty_rate: [5, 35, 0.5],
  density_km2: [0, 25000, 50],
  fastfood_per10k: [0, 60, 0.5],
  sport_per10k: [0, 150, 1],
};
const ORDER: FeatureKey[] = ["pct_65plus", "poverty_rate", "density_km2", "fastfood_per10k", "sport_per10k"];

/** Prevalence (%) applied to the city's population, rounded to the nearest 10 people. */
const people = (pct: number | null | undefined, pop: number | null | undefined) =>
  pct == null || !pop ? null : Math.round(((pct / 100) * pop) / 10) * 10;
const fmtPeople = (n: number | null) => (n == null ? "—" : n.toLocaleString("fr-FR"));

const RELIABILITY: Record<DiseasePrediction["reliability"], { label: string; bg: string; fg: string }> = {
  fiable: { label: "Estimation fiable", bg: "#DDF0EA", fg: "#0E5A50" },
  indicative: { label: "Estimation approximative", bg: "#F6EDD3", fg: "#6E5110" },
  "peu fiable": { label: "Ordre de grandeur", bg: "#EFEFEA", fg: "#61656E" },
};

export default function PredictionPage() {
  const { territories } = useAnalytics();
  const { account, authReady } = useSession();
  const [patho, setPatho] = useState<PredPatho>("diabete");
  const [city, setCity] = useState<string>("");
  const [sim, setSim] = useState<Record<FeatureKey, number> | null>(null);
  const [simRes, setSimRes] = useState<{ prediction: number; leaf: number; path: PathStep[] } | null>(null);

  // Our city only: the commune carried by the menu (?ville=), else the signed-in account's commune.
  useEffect(() => {
    if (city || !authReady) return;
    let v: string | null = null;
    try {
      v = new URLSearchParams(window.location.search).get("ville")?.toUpperCase() ?? null;
    } catch {
      /* no URL access */
    }
    const pick = v ?? account?.city_code ?? null;
    if (pick) setCity(pick);
  }, [city, account, authReady]);

  const all = useCommunePredictions(city || null);
  const model = useModel(patho);
  const codes = useMemo(() => (city ? [city] : []), [city]);
  const preds = usePredictions(codes, patho);
  const t = territories.find((x) => x.code === city);
  const cityName = t?.name ?? all.data?.name ?? "votre commune";
  const pop = t?.context.population ?? null;
  const p = city ? preds.data?.territories[city] : undefined;
  const disease = all.data?.items.find((i) => i.patho === patho);
  const rel = disease ? RELIABILITY[disease.reliability] : null;
  const m = model.data;
  // Factors with no measured effect on this disease have no slider.
  const active = m ? ORDER.filter((k) => (m.importances[k] ?? 0) > 0) : ORDER;
  const inactive = m ? ORDER.filter((k) => !active.includes(k)) : [];

  // Simulator starts from the city's real values.
  useEffect(() => {
    if (p && !p.error) {
      setSim({ ...p.features });
      setSimRes(null);
    }
  }, [p, patho]);
  const dirty = !!(sim && p && ORDER.some((k) => Math.abs(sim[k] - p.features[k]) > 1e-9));
  useEffect(() => {
    if (!sim || !dirty) {
      setSimRes(null);
      return;
    }
    const id = setTimeout(() => {
      simulate(patho, sim)
        .then(setSimRes)
        .catch(() => setSimRes(null));
    }, 150);
    return () => clearTimeout(id);
  }, [sim, dirty, patho]);

  const now = p && !p.error ? p.prediction : null;
  const simulated = simRes?.prediction ?? now;
  const deltaPeople = now != null && simRes && pop != null ? (people(simRes.prediction, pop) ?? 0) - (people(now, pop) ?? 0) : null;

  return (
    <div>
      <PageHeader title={`Prédictions · ${cityName}`} subtitle="Nombre estimé d'habitants touchés, maladie par maladie." />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-w-0 flex-1 items-center gap-3">
            <span className="text-[14px] font-semibold text-ink">Maladie</span>
            <select
              className="input h-11 w-full max-w-[420px] text-[14px] font-medium"
              value={patho}
              onChange={(e) => setPatho(e.target.value)}
              aria-label="Choisir une maladie"
              disabled={!all.data}
            >
              {(all.data?.items ?? []).map((i) => (
                <option key={i.patho} value={i.patho}>
                  {i.label}
                </option>
              ))}
              {!all.data && <option value={patho}>Chargement…</option>}
            </select>
          </label>
          {rel && (
            <span className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: rel.bg, color: rel.fg }}>
              {rel.label}
            </span>
          )}
        </div>
        {all.error && (
          <div className="mt-3">
            <ErrorBox>{all.error}</ErrorBox>
          </div>
        )}
      </Card>

      {model.error && <ErrorBox>{model.error}</ErrorBox>}
      {!m || !city ? (
        !model.error && <Spinner label="Calcul de l'estimation…" />
      ) : preds.loading ? (
        <Spinner />
      ) : !p || p.error ? (
        <p className="text-sm text-ink-muted">{p?.error ?? "Aucune estimation pour cette commune."}</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card title="Aujourd'hui">
            <p className="num text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmt(p.prediction, 1)} %</p>
            <p className="mt-1 text-[13px] text-ink-muted">des habitants</p>
            {pop != null && (
              <p className="num mt-3 text-[15px] text-ink-2">
                ≈ <strong className="font-semibold text-ink">{fmtPeople(people(p.prediction, pop))}</strong> personnes sur {fmtPeople(pop)}
              </p>
            )}
            <dl className="mt-5 space-y-2 border-t border-hairline pt-4 text-[13px]">
              {p.observed_departement != null && (
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-muted">Chiffre réel du département</dt>
                  <dd className="num font-semibold text-ink">{fmt(p.observed_departement, 1)} %</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Marge d'erreur</dt>
                <dd className="num font-semibold text-ink">± {fmt(m.metrics.mae_cv, 1)} point</dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Et si… ?"
            subtitle="Bougez un curseur pour voir l'effet sur le nombre de malades."
            actions={
              dirty ? (
                <button className="secondary-btn h-9 text-[13px]" onClick={() => setSim({ ...p.features })}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Réinitialiser
                </button>
              ) : undefined
            }
          >
            {sim && (
              <>
                <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="num text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmt(simulated, 1)} %</span>
                  {pop != null && <span className="num text-[14px] text-ink-2">≈ {fmtPeople(people(simulated, pop))} personnes</span>}
                  {deltaPeople != null && deltaPeople !== 0 && (
                    <span
                      className="num rounded-full px-2.5 py-0.5 text-[13px] font-semibold"
                      style={deltaPeople < 0 ? { background: "#DDF0EA", color: "#0E5A50" } : { background: "#FBE6DF", color: "#9A2F1C" }}
                    >
                      {deltaPeople > 0 ? "+" : "−"} {fmtPeople(Math.abs(deltaPeople))} personnes
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {active.map((k) => {
                    const [lo, hi, step] = RANGES[k];
                    return (
                      <label key={k} className="block">
                        <span className="flex items-baseline justify-between gap-2 text-[13.5px]">
                          <span className="text-ink">{FEATURE_SHORT[k]}</span>
                          <span className="num shrink-0 font-semibold text-ink">{fmtFeature(k, sim[k])}</span>
                        </span>
                        <input
                          type="range"
                          min={Math.min(lo, p.features[k])}
                          max={Math.max(hi, p.features[k])}
                          step={step}
                          value={sim[k]}
                          onChange={(e) => setSim({ ...sim, [k]: Number(e.target.value) })}
                          className="mt-1 h-7 w-full"
                          aria-label={FEATURE_SHORT[k]}
                        />
                      </label>
                    );
                  })}
                </div>
                {inactive.length > 0 && (
                  <p className="mt-3 text-[12px] text-ink-muted">Sans effet mesuré sur cette maladie : {inactive.map((k) => FEATURE_SHORT[k].toLowerCase()).join(", ")}.</p>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      <p className="mt-4 text-[12px] text-ink-muted">
        Estimation statistique apprise sur les 96 départements (Assurance Maladie {m?.year ?? ""}) : elle montre des liens, pas des causes.
      </p>
    </div>
  );
}

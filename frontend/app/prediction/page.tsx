"use client";

import { NextStep } from "@/components/next-step";
import { Info, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { DecisionTree, FEATURE_SHORT, fmtFeature, rampColor } from "@/components/decision-tree";
import { Card, ErrorBox, Kpi, PageHeader, Spinner, cx } from "@/components/ui";
import { fmt } from "@/lib/bands";
import { simulate, useModel, usePredictions, type FeatureKey, type PathStep, type PredPatho } from "@/lib/prediction";

const PATHOS: PredPatho[] = ["diabete", "cardio", "respiratoire", "cancers"];
const RANGES: Record<FeatureKey, [number, number, number]> = {
  pct_65plus: [10, 35, 0.5],
  poverty_rate: [5, 35, 0.5],
  density_km2: [0, 25000, 50],
  fastfood_per10k: [0, 60, 0.5],
  sport_per10k: [0, 150, 1],
};
const ORDER: FeatureKey[] = ["pct_65plus", "poverty_rate", "density_km2", "fastfood_per10k", "sport_per10k"];

function LevelTag({ level }: { level: "commune" | "departement" }) {
  return (
    <span className={cx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", level === "commune" ? "bg-accent-soft text-accent-text" : "bg-[#EFEFEA] text-ink-2")}>
      {level === "commune" ? "commune" : "département"}
    </span>
  );
}

function PathSentences({ path }: { path: PathStep[] }) {
  return (
    <ol className="space-y-1.5">
      {path.map((s, i) => (
        <li key={s.node} className="flex gap-2 text-sm text-ink-2">
          <span className="num mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-white">{i + 1}</span>
          <span>
            {FEATURE_SHORT[s.feature]} = <strong className="num text-ink">{fmtFeature(s.feature, s.value)}</strong>{" "}
            {s.condition === "<=" ? "≤" : ">"} {fmtFeature(s.feature, s.threshold)} → branche « {s.condition === "<=" ? "oui" : "non"} »
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function PredictionPage() {
  const { territories } = useAnalytics();
  const [patho, setPatho] = useState<PredPatho>("diabete");
  const [selected, setSelected] = useState<string>("");
  const [openLeaf, setOpenLeaf] = useState<number | null>(null);
  const [sim, setSim] = useState<Record<FeatureKey, number> | null>(null);
  const [simRes, setSimRes] = useState<{ prediction: number; leaf: number; path: PathStep[] } | null>(null);

  const model = useModel(patho);
  const codes = useMemo(() => territories.map((t) => t.code), [territories]);
  const preds = usePredictions(codes, patho);

  useEffect(() => {
    if (!selected && codes.length) setSelected(codes.includes("35238") ? "35238" : codes[0]);
  }, [codes, selected]);

  const p = selected ? preds.data?.territories[selected] : undefined;

  // Simulator starts from the selected territory's real values.
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
    const t = setTimeout(() => {
      simulate(patho, sim)
        .then(setSimRes)
        .catch(() => setSimRes(null));
    }, 150);
    return () => clearTimeout(t);
  }, [sim, dirty, patho]);

  const m = model.data;
  const rows = useMemo(
    () =>
      territories
        .map((t) => ({ t, r: preds.data?.territories[t.code] }))
        .filter((x) => x.r && !x.r.error)
        .sort((a, b) => b.r!.prediction - a.r!.prediction),
    [territories, preds.data],
  );

  const activePath = (simRes ?? p)?.path.map((s) => s.node) ?? [];
  const activeLeaf = (simRes ?? p)?.leaf ?? null;
  const leafNode = openLeaf != null ? m?.nodes.find((n) => n.id === openLeaf) : null;
  const importances = m ? (Object.entries(m.importances) as [FeatureKey, number][]).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div>
      <PageHeader
        title="Prédire les maladies"
        subtitle="Arbre de décision entraîné sur les 96 départements de métropole : à partir du profil d'un territoire, il prédit la prévalence d'une maladie chronique."
        actions={
          <div className="seg" role="group" aria-label="Maladie prédite">
            {PATHOS.map((k) => (
              <button
                key={k}
                aria-pressed={patho === k}
                onClick={() => {
                  setPatho(k);
                  setOpenLeaf(null);
                }}
              >
                {m?.pathologies[k] ?? k}
              </button>
            ))}
          </div>
        }
      />

      {model.error && <ErrorBox>{model.error}</ErrorBox>}
      {!m ? (
        !model.error && <Spinner label="Entraînement de l'arbre…" />
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Part expliquée (validation croisée)"
              value={`${fmt(m.metrics.r2_cv * 100, 0)} %`}
              sub={m.metrics.r2_cv >= 0.6 ? "Bonne capacité prédictive" : m.metrics.r2_cv >= 0.3 ? "Capacité prédictive modérée" : "Capacité prédictive faible : à interpréter avec prudence"}
            />
            <Kpi
              label="Erreur moyenne"
              value={`± ${fmt(m.metrics.mae_cv, 2)} pt`}
              sub={`contre ± ${fmt(m.metrics.mae_baseline, 2)} pt en prédisant la moyenne nationale (${m.metrics.gain_vs_baseline_pct > 0 ? "−" : "+"}${fmt(Math.abs(m.metrics.gain_vs_baseline_pct), 0)} %)`}
            />
            <Kpi label="Prévalence observée" value={`${fmt(m.metrics.target_mean, 2)} %`} sub={`moyenne des départements · de ${fmt(m.metrics.target_min, 1)} à ${fmt(m.metrics.target_max, 1)} % (${m.year})`} />
            <div className="rounded-card border border-hairline bg-white p-5">
              <p className="text-[13px] text-ink-muted">Ce qui pèse dans l'arbre</p>
              <ul className="mt-2 space-y-1.5">
                {importances.map(([k, v]) => (
                  <li key={k} className="grid grid-cols-[minmax(0,1fr)_64px_36px] items-center gap-2 text-xs">
                    <span className="truncate text-ink">{FEATURE_SHORT[k]}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-[#EEEEE9]">
                      <span className="block h-full rounded-full bg-[#3E63DD]" style={{ width: `${v * 100}%` }} />
                    </span>
                    <span className="num text-right text-ink-2">{fmt(v * 100, 0)} %</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Card
            title={`Arbre de décision · ${m.label}`}
            subtitle={`${m.params.max_depth} niveaux, au moins ${m.params.min_samples_leaf} départements par feuille. Chemin surligné : ${simRes ? "simulation en cours" : p?.name ?? "—"}. Cliquez une feuille pour voir ses départements.`}
            actions={
              <label className="flex items-center gap-2 text-[13px] text-ink-muted">
                Territoire
                <select className="input h-10 w-auto min-w-[200px]" value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {territories.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            }
          >
            <DecisionTree model={m} activePath={activePath} activeLeaf={activeLeaf} openLeaf={openLeaf} onLeafClick={(id) => setOpenLeaf((o) => (o === id ? null : id))} />
            {leafNode?.departements && (
              <div className="mt-4 rounded-xl bg-plane p-4">
                <p className="text-sm font-semibold text-ink">
                  Feuille à {fmt(leafNode.value, 2)} % · {leafNode.samples} départements
                </p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {leafNode.departements.map((d) => (
                    <span key={d.code} className="num rounded-full border border-hairline bg-white px-2.5 py-1 text-xs text-ink-2">
                      {d.name} ({d.code}) · {fmt(d.prev, 1)} %
                    </span>
                  ))}
                </p>
              </div>
            )}
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <Card title={`Prédiction · ${p?.name ?? "—"}`} subtitle="Comment l'arbre arrive à ce résultat">
              {preds.loading ? (
                <Spinner />
              ) : !p || p.error ? (
                <p className="text-sm text-ink-muted">{p?.error ?? "Choisissez un territoire."}</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                    <div>
                      <p className="text-[13px] text-ink-muted">Prévalence prédite</p>
                      <p className="num text-[44px] font-semibold leading-none tracking-[-0.03em] text-ink">
                        {fmt(p.prediction, 2)} %
                      </p>
                    </div>
                    {p.observed_departement != null && (
                      <div className="pb-1 text-sm text-ink-2">
                        Observé dans le département {p.departement} : <strong className="num text-ink">{fmt(p.observed_departement, 2)} %</strong>
                        <br />
                        <span className="text-xs text-ink-muted">
                          écart {p.gap! > 0 ? "+" : ""}
                          {fmt(p.gap, 2)} pt
                        </span>
                      </div>
                    )}
                  </div>
                  <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Chemin dans l'arbre</h3>
                  <PathSentences path={p.path} />
                  <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">Profil utilisé</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {ORDER.map((k) => (
                      <li key={k} className="flex items-center justify-between gap-2 rounded-xl bg-plane px-3 py-2 text-sm">
                        <span className="text-ink-2">{FEATURE_SHORT[k]}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="num font-semibold text-ink">{fmtFeature(k, p.features[k])}</span>
                          <LevelTag level={p.feature_levels[k]} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <Card
              title="Et si… ?"
              subtitle="Modifiez le profil pour voir comment la prédiction évolue (le chemin se met à jour dans l'arbre)."
              actions={
                dirty && p && !p.error ? (
                  <button className="secondary-btn h-9 text-[13px]" onClick={() => setSim({ ...p.features })}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Valeurs réelles
                  </button>
                ) : undefined
              }
            >
              {!sim || !p || p.error ? (
                <p className="text-sm text-ink-muted">Choisissez un territoire.</p>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-baseline gap-x-3">
                    <span className="num text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmt(simRes?.prediction ?? p.prediction, 2)} %</span>
                    {simRes && (
                      <span className={cx("num text-sm font-semibold", simRes.prediction > p.prediction ? "text-[#9A2F1C]" : simRes.prediction < p.prediction ? "text-[#0E5A50]" : "text-ink-muted")}>
                        {simRes.prediction > p.prediction ? "+" : ""}
                        {fmt(simRes.prediction - p.prediction, 2)} pt vs réel
                      </span>
                    )}
                  </div>
                  <div className="space-y-4">
                    {ORDER.map((k) => {
                      const [lo, hi, step] = RANGES[k];
                      return (
                        <label key={k} className="block">
                          <span className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="text-ink">{m.features[k].label}</span>
                            <span className="num font-semibold text-ink">{fmtFeature(k, sim[k])}</span>
                          </span>
                          <input
                            type="range"
                            min={lo}
                            max={Math.max(hi, p.features[k])}
                            step={step}
                            value={sim[k]}
                            onChange={(e) => setSim({ ...sim, [k]: Number(e.target.value) })}
                            className="mt-1 h-7 w-full"
                            aria-label={m.features[k].label}
                          />
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-xs text-ink-muted">L'arbre ne change de prédiction que lorsqu'une valeur franchit un seuil de l'arbre : la réponse est en paliers.</p>
                </>
              )}
            </Card>
          </div>

          <Card className="mt-4" title={`Prédictions par territoire · ${m.label}`} subtitle="Trié par prévalence prédite. Cliquez une ligne pour suivre son chemin dans l'arbre.">
            {preds.loading ? (
              <Spinner />
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-xs text-ink-muted">
                    <tr className="border-b border-hairline">
                      <th className="px-2 py-2 text-left font-medium">Territoire</th>
                      <th className="px-2 py-2 text-right font-medium">Prédiction</th>
                      <th className="px-2 py-2 text-right font-medium">Observé (département)</th>
                      <th className="px-2 py-2 text-right font-medium">Écart</th>
                      <th className="px-2 py-2 text-left font-medium">Premier critère</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ t, r }) => {
                      const c = rampColor(r!.prediction, m.metrics.target_min, m.metrics.target_max);
                      return (
                        <tr key={t.code} onClick={() => setSelected(t.code)} className={cx("cursor-pointer border-b border-[#F2F2EE] hover:bg-[#FAFAF7]", selected === t.code && "bg-[#FAFAF7]")}>
                          <td className="px-2 py-2.5">
                            <button className="text-left font-medium text-ink hover:underline" onClick={() => setSelected(t.code)}>
                              {t.name}
                            </button>
                            <span className="block text-xs text-ink-muted">dép. {r!.departement}</span>
                          </td>
                          <td className="px-2 py-2.5 text-right">
                            <span className="num inline-block rounded-lg px-2 py-1 font-semibold" style={{ background: c.bg, color: c.fg }}>
                              {fmt(r!.prediction, 2)} %
                            </span>
                          </td>
                          <td className="num px-2 py-2.5 text-right text-ink-2">{fmt(r!.observed_departement, 2)} %</td>
                          <td className="num px-2 py-2.5 text-right text-ink-muted">
                            {r!.gap! > 0 ? "+" : ""}
                            {fmt(r!.gap, 2)}
                          </td>
                          <td className="px-2 py-2.5 text-ink-2">
                            {r!.path[0] && `${FEATURE_SHORT[r!.path[0].feature]} ${r!.path[0].condition === "<=" ? "≤" : ">"} ${fmtFeature(r!.path[0].feature, r!.path[0].threshold)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <p className="mt-4 flex gap-2 rounded-xl border border-hairline bg-white px-4 py-3 text-xs leading-relaxed text-ink-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              {m.caveat} {m.source} Les prévalences observées sont départementales : l'écart d'une commune avec son département ne mesure pas une erreur de la commune.
            </span>
          </p>
        </>
      )}
      <NextStep step={3} />
    </div>
  );
}

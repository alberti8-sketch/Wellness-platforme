"use client";

import { ArrowRight, Bike, Dumbbell, Footprints, LayoutGrid, type LucideIcon, Sandwich, Search, Stethoscope, Trees, Users, X } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/components/session";
import type { DeptValue, MapPoint } from "@/components/domain-map";
import { ErrorBox, Spinner } from "@/components/ui";
import { fmt } from "@/lib/bands";
import {
  type Commune,
  type Direction,
  type LegendClass,
  NO_DATA,
  OUR_CITIES,
  WALK_LEVELS,
  walkLevelOf,
  median,
  normalize,
  quintileClasses,
  useCommuneDomains,
} from "@/lib/communes";
import { useDepartements } from "@/lib/geo";
import { mean } from "@/lib/metrics";
import { useDepartementData } from "@/lib/prediction";

const DomainMap = dynamic(() => import("@/components/domain-map"), { ssr: false, loading: () => <Spinner label="Chargement de la carte…" /> });

type Level = "commune" | "departement";
interface Ind {
  key: string;
  short: string;
  level: Level;
}
const DOMAINS: { id: string; label: string; icon: LucideIcon; inds: Ind[] }[] = [
  {
    id: "marche",
    label: "Marche",
    icon: Footprints,
    inds: [
      { key: "walk_score", short: "Indice global", level: "commune" },
      { key: "walk_safety", short: "Sécurité", level: "commune" },
      { key: "walk_comfort", short: "Confort", level: "commune" },
      { key: "walk_services", short: "Services", level: "commune" },
      { key: "pedestrian_share", short: "Zones piétonnes", level: "commune" },
    ],
  },
  {
    id: "velo",
    label: "Vélo",
    icon: Bike,
    inds: [
      { key: "bike_share", short: "Voirie cyclable", level: "commune" },
      { key: "bike_parking_1000", short: "Stationnement", level: "commune" },
      { key: "zone30_share", short: "Zones 30", level: "commune" },
    ],
  },
  {
    id: "alimentation",
    label: "Alimentation",
    icon: Sandwich,
    inds: [
      { key: "food_score", short: "Score", level: "commune" },
      { key: "fresh_10k", short: "Produits frais", level: "commune" },
      { key: "fastfood_10k", short: "Fast-foods", level: "commune" },
      { key: "restaurant_10k", short: "Restaurants", level: "commune" },
    ],
  },
  {
    id: "cadre",
    label: "Cadre de vie",
    icon: Trees,
    inds: [
      { key: "land_green_pct", short: "Espaces verts", level: "commune" },
      { key: "land_built_pct", short: "Sols artificialisés", level: "commune" },
      { key: "land_natural_pct", short: "Milieux naturels", level: "commune" },
    ],
  },
  { id: "sport", label: "Sport", icon: Dumbbell, inds: [{ key: "sport_10k", short: "Équipements", level: "commune" }] },
  {
    id: "sante",
    label: "Santé",
    icon: Stethoscope,
    inds: [
      { key: "gp_10k", short: "Médecins", level: "commune" },
      { key: "prev_diabete", short: "Diabète", level: "departement" },
      { key: "prev_sub_depistage", short: "Dépistage", level: "departement" },
      { key: "icp", short: "Prévention", level: "departement" },
      { key: "framingham_10y", short: "Risque cardio", level: "departement" },
    ],
  },
  {
    id: "contexte",
    label: "Contexte",
    icon: Users,
    inds: [
      { key: "poverty_rate", short: "Pauvreté", level: "departement" },
      { key: "density_km2", short: "Densité", level: "commune" },
      { key: "vet_per10k", short: "Vétérinaires", level: "departement" },
    ],
  },
];
const ALL_INDS = DOMAINS.flatMap((d) => d.inds.map((i) => ({ ...i, domain: d.id })));

const unitOf = (u: string) => (u === "%" ? " %" : u.startsWith("/") ? ` ${u}` : "");
const shortUnit = (u: string) => (u === "%" ? "%" : u.startsWith("/") ? u : u.replace("pour ", "/ ").replace(" hab.", "").replace("10 000", "10 000 hab.").replace("1 000", "1 000 hab."));

interface Meta {
  label: string;
  unit: string;
  source: string;
  direction: Direction;
}

export default function CartePage() {
  const { meta, communes, error } = useCommuneDomains();
  const dept = useDepartementData();
  const { geo } = useDepartements();
  const [domain, setDomain] = useState("marche");
  const [key, setKey] = useState("walk_score");
  const [selected, setSelected] = useState<string | null>(null);
  const { account } = useSession();
  const placed = useRef(false);

  // Shareable view: /carte?indicateur=fastfood_10k&commune=35238
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const k = q.get("indicateur");
      const ind = ALL_INDS.find((i) => i.key === k);
      if (ind) {
        setDomain(ind.domain);
        setKey(ind.key);
      }
      const c = q.get("commune") ?? q.get("dep");
      if (c) {
        setSelected(c.toUpperCase());
        placed.current = true;
      }
    } catch {
      /* no URL access */
    }
  }, []);

  // Signed-in account: open the map zoomed on its commune (once; the user can then move freely).
  useEffect(() => {
    if (placed.current || !account) return;
    placed.current = true;
    setSelected(account.city_code);
  }, [account]);

  const ind = ALL_INDS.find((i) => i.key === key)!;
  const indMeta: Meta | null = ind.level === "commune" ? meta?.indicators[key] ?? null : dept.data?.indicators[key] ?? null;
  const unit = indMeta ? unitOf(indMeta.unit) : "";
  const format = (v: number | null | undefined, k = key) => {
    if (v == null) return "—";
    const m = meta?.indicators[k] ?? dept.data?.indicators[k];
    const u = m ? unitOf(m.unit) : "";
    return `${fmt(v, Math.abs(v) >= 100 ? 0 : 1)}${u}`;
  };

  // Colour classes of every commune indicator (map + detail card dots).
  const classesByKey = useMemo(() => {
    const out: Record<string, LegendClass[]> = {};
    if (!meta) return out;
    for (const [k, m] of Object.entries(meta.indicators)) {
      out[k] = quintileClasses(
        communes.map((c) => c.values[k]).filter((v): v is number => v != null),
        m.direction,
      );
    }
    return out;
  }, [meta, communes]);
  const deptClassesByKey = useMemo(() => {
    const out: Record<string, LegendClass[]> = {};
    if (!dept.data) return out;
    for (const [k, m] of Object.entries(dept.data.indicators)) {
      out[k] = quintileClasses(
        dept.data.departements.map((d) => d.values[k]).filter((v): v is number => v != null),
        m.direction,
      );
    }
    return out;
  }, [dept.data]);

  const colorOf = (classes: LegendClass[] | undefined, v: number | null | undefined) => (v == null || !classes ? null : classes.find((c) => c.test(v))?.color ?? null);
  const isWalkClass = key === "walk_score";

  const points = useMemo<MapPoint[] | null>(() => {
    if (ind.level !== "commune" || !communes.length) return null;
    const classes = classesByKey[key];
    return communes.map((c) => {
      const v = c.values[key];
      const level = walkLevelOf(c.walk_class);
      const color = isWalkClass ? level?.color ?? null : colorOf(classes, v);
      const display = isWalkClass && level ? `${level.label} · ${fmt(v, 1)} /20` : v == null ? "non évalué" : format(v);
      return { code: c.code, name: c.name, lat: c.lat, lon: c.lon, population: c.population, color, display };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communes, key, classesByKey, ind.level, meta]);

  const deptValues = useMemo<Record<string, DeptValue> | null>(() => {
    if (ind.level !== "departement" || !dept.data) return null;
    const classes = deptClassesByKey[key];
    return Object.fromEntries(
      dept.data.departements.map((d) => {
        const v = d.values[key];
        return [d.code, { name: d.name, color: colorOf(classes, v), display: format(v) }];
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dept.data, key, deptClassesByKey, ind.level]);

  // Legend & key figure.
  const nums =
    ind.level === "commune"
      ? communes.map((c) => c.values[key]).filter((v): v is number => v != null)
      : (dept.data?.departements ?? []).map((d) => d.values[key]).filter((v): v is number => v != null);
  const keyFigure = ind.level === "commune" ? median(nums) : mean(nums);
  const legend: LegendClass[] = isWalkClass
    ? WALK_LEVELS.map((l) => ({
        label: l.label,
        color: l.color,
        count: communes.filter((c) => walkLevelOf(c.walk_class) === l).length,
        test: () => false,
      }))
    : ind.level === "commune"
      ? classesByKey[key] ?? []
      : deptClassesByKey[key] ?? [];
  const scale = ind.level === "commune" ? "communes" : "départements";
  const missing = ind.level === "commune" ? communes.length - nums.length : 0;

  const selCommune = communes.find((c) => c.code === selected) ?? null;
  const selDept = !selCommune && selected ? dept.data?.departements.find((d) => d.code === selected) ?? null : null;
  const deptOfSel = selCommune ? dept.data?.departements.find((d) => d.code === selCommune.dep) ?? null : null;

  const pickDomain = (id: string) => {
    const d = DOMAINS.find((x) => x.id === id)!;
    setDomain(id);
    setKey(d.inds[0].key);
    if (d.inds[0].level === "departement" && selCommune) setSelected(selCommune.dep);
  };
  const pickInd = (i: Ind) => {
    setKey(i.key);
    if (i.level === "departement" && selCommune) setSelected(selCommune.dep);
  };

  const D = DOMAINS.find((d) => d.id === domain)!;

  return (
    <div className="relative flex min-h-screen flex-col md:block md:h-screen">
      {(error || dept.error) && (
        <div className="absolute left-1/2 top-4 z-[1100] -translate-x-1/2">
          <ErrorBox>{error ?? dept.error}</ErrorBox>
        </div>
      )}

      {/* Map */}
      <div className="order-2 h-[75vh] w-full md:absolute md:inset-0 md:h-full">
        <DomainMap
          points={points}
          departements={geo}
          deptValues={deptValues}
          metricLabel={indMeta?.label ?? ""}
          selected={selected}
          onSelect={(c) => setSelected((s) => (s === c ? null : c))}
        />
      </div>

      {/* Left panel: domains, indicator, key figure, legend */}
      <aside className="order-1 z-[1000] w-full bg-white p-4 md:absolute md:left-4 md:top-4 md:max-h-[calc(100vh-2rem)] md:w-[330px] md:overflow-y-auto md:rounded-2xl md:shadow-[0_8px_30px_rgba(21,23,28,0.12)]">
        <h1 className="sr-only">Carte de France</h1>

        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Domaine">
          {DOMAINS.map((d) => {
            const on = d.id === domain;
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                role="tab"
                aria-selected={on}
                onClick={() => pickDomain(d.id)}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[12px] font-medium transition ${
                  on ? "bg-ink text-white" : "bg-plane text-ink-2 hover:bg-hover"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {d.label}
              </button>
            );
          })}
        </div>

        {D.inds.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {D.inds.map((i) => (
              <button
                key={i.key}
                onClick={() => pickInd(i)}
                className={`rounded-full border px-3 py-1 text-[12px] transition ${
                  i.key === key ? "border-ink bg-ink text-white" : "border-hairline bg-white text-ink-2 hover:border-ink-faint"
                }`}
              >
                {i.short}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          <p className="text-[13px] font-medium leading-snug text-ink">{indMeta?.label ?? "…"}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
              {keyFigure != null ? fmt(keyFigure, Math.abs(keyFigure) >= 100 ? 0 : 1) : "—"}
            </span>
            <span className="text-[13px] text-ink-muted">{indMeta ? shortUnit(indMeta.unit) : ""}</span>
          </p>
          <p className="mt-1 text-[12px] text-ink-muted">
            {ind.level === "commune" ? "médiane des communes" : "moyenne des départements"}
            {ind.level === "commune" && missing > 0 ? ` · ${nums.length.toLocaleString("fr-FR")} communes évaluées` : ""}
          </p>
        </div>

        <ul className="mt-4 space-y-1.5" aria-label="Légende">
          {legend.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-[13px]">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" style={{ background: c.color }} aria-hidden />
              <span className="flex-1 text-ink-2">{c.label}</span>
              <span className="num text-[12px] text-ink-muted">{c.count.toLocaleString("fr-FR")}</span>
            </li>
          ))}
          {missing > 0 && (
            <li className="flex items-center gap-2.5 text-[13px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NO_DATA }} aria-hidden />
              <span className="flex-1 text-ink-muted">Non évaluée</span>
              <span className="num text-[12px] text-ink-muted">{missing.toLocaleString("fr-FR")}</span>
            </li>
          )}
        </ul>
        {indMeta?.direction && (
          <p className="mt-3 text-[12px] text-ink-muted">
            <span className="font-medium" style={{ color: "#1E7462" }}>
              Vert
            </span>{" "}
            = plus favorable à la santé
          </p>
        )}
        <p className="mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-ink-faint">
          Échelle : {ind.level === "commune" ? "commune" : "département"} · Source : {indMeta?.source ?? "…"}
        </p>
      </aside>

      {/* Right column: search + detail card */}
      <div className="order-3 z-[1000] flex w-full flex-col gap-3 p-4 md:absolute md:right-4 md:top-4 md:w-[340px] md:p-0">
        {account && (
          <Link
            href={`/dashboard?ville=${account.city_code}`}
            className="group flex items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-[0_8px_30px_rgba(21,23,28,0.18)] transition hover:bg-[#2A2D35]"
          >
            <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold leading-tight">Vue d'ensemble{account.city_name ? ` de ${account.city_name}` : ""}</span>
              <span className="block text-[12px] text-white/70">Le rapport complet de votre commune</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
        <CommuneSearch communes={communes} onPick={(c) => setSelected(c.code)} />
        {selCommune && meta && (
          <CommuneCard
            c={selCommune}
            deptName={deptOfSel?.name ?? selCommune.dep}
            deptValues={deptOfSel?.values ?? null}
            refs={{
              ...Object.fromEntries(
                Object.keys(meta.indicators).map((k) => [k, mean(communes.map((x) => x.values[k]).filter((v): v is number => v != null))]),
              ),
              ...Object.fromEntries(
                Object.keys(dept.data?.indicators ?? {}).map((k) => [k, mean((dept.data?.departements ?? []).map((d) => d.values[k]))]),
              ),
            }}
            directions={{
              ...Object.fromEntries(Object.entries(meta.indicators).map(([k, m]) => [k, m.direction])),
              ...Object.fromEntries(Object.entries(dept.data?.indicators ?? {}).map(([k, m]) => [k, m.direction])),
            }}
            onClose={() => setSelected(null)}
          />
        )}
        {selDept && indMeta && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(21,23,28,0.12)]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[16px] font-semibold text-ink">{selDept.name}</p>
                <p className="text-[12px] text-ink-muted">Département {selDept.code}</p>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-[13px] text-ink-2">{indMeta.label}</p>
            <p className="num mt-0.5 text-[26px] font-semibold text-ink">{format(selDept.values[key])}</p>
            <p className="text-[12px] text-ink-muted">Moyenne des départements : {format(keyFigure)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function CommuneSearch({ communes, onPick }: { communes: Commune[]; onPick: (c: Commune) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const n = normalize(q);
  const results = n
    ? communes
        .filter((c) => normalize(c.name).includes(n) || c.code === q.trim())
        .sort((a, b) => Number(!normalize(a.name).startsWith(n)) - Number(!normalize(b.name).startsWith(n)) || b.population - a.population)
        .slice(0, 8)
    : OUR_CITIES.map((code) => communes.find((c) => c.code === code)).filter((c): c is Commune => !!c);

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Rechercher une commune"
        aria-label="Rechercher une commune"
        className="h-11 w-full rounded-2xl border-0 bg-white pl-10 pr-3 text-[14px] text-ink shadow-[0_8px_30px_rgba(21,23,28,0.12)] outline-none ring-ink/20 focus:ring-2"
      />
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-12 overflow-hidden rounded-2xl bg-white py-1.5 shadow-[0_8px_30px_rgba(21,23,28,0.16)]">
          {!n && <li className="px-4 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Nos villes</li>}
          {results.map((c) => (
            <li key={c.code}>
              <button
                onClick={() => {
                  onPick(c);
                  setQ("");
                  setOpen(false);
                }}
                className="flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-plane"
              >
                <span className="text-[14px] text-ink">{c.name}</span>
                <span className="text-[12px] text-ink-muted">{c.dep}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CardRow = { label: string; k: string; unit: string; dept?: boolean; digits?: number };

const CARD_SECTIONS: { title: string; icon: LucideIcon; rows: CardRow[] }[] = [
  {
    title: "Vélo",
    icon: Bike,
    rows: [
      { label: "Rues avec piste cyclable", k: "bike_share", unit: " %" },
      { label: "Rues en zone 30", k: "zone30_share", unit: " %" },
    ],
  },
  {
    title: "Alimentation",
    icon: Sandwich,
    rows: [
      { label: "Score alimentation", k: "food_score", unit: " /100", digits: 0 },
      { label: "Fast-foods pour 10 000 hab.", k: "fastfood_10k", unit: "" },
    ],
  },
  { title: "Sport", icon: Dumbbell, rows: [{ label: "Équipements pour 10 000 hab.", k: "sport_10k", unit: "", digits: 0 }] },
  {
    title: "Santé",
    icon: Stethoscope,
    rows: [
      { label: "Médecins pour 10 000 hab.", k: "gp_10k", unit: "" },
      { label: "Diabète", k: "prev_diabete", unit: " %", dept: true },
      { label: "Dépistage des cancers", k: "prev_sub_depistage", unit: " /100", dept: true, digits: 0 },
    ],
  },
  {
    title: "Cadre de vie",
    icon: Trees,
    rows: [
      { label: "Espaces verts", k: "land_green_pct", unit: " %" },
      { label: "Sols construits", k: "land_built_pct", unit: " %", digits: 0 },
    ],
  },
];

type Verdict = "better" | "same" | "worse";
const VERDICT: Record<Verdict, { label: string; mark: string; tint: string; text: string }> = {
  better: { label: "Mieux que la moyenne", mark: "▲", tint: "#DDF0EA", text: "#1F8A78" },
  same: { label: "Dans la moyenne", mark: "●", tint: "#F6EDD3", text: "#B9A577" },
  worse: { label: "Moins bien que la moyenne", mark: "▼", tint: "#FBE6DF", text: "#C2452D" },
};

/** Commune vs reference (10 % margin), in the direction that is better for health. */
function verdict(v: number | null | undefined, ref: number | null | undefined, direction: Direction | undefined): Verdict | null {
  if (v == null || ref == null || !direction) return null;
  if (ref === 0) return v === 0 ? "same" : direction === "higher_is_better" ? "better" : "worse";
  const r = v / ref;
  const up = direction === "higher_is_better";
  if (r >= 1.1) return up ? "better" : "worse";
  if (r <= 0.9) return up ? "worse" : "better";
  return "same";
}

/** Right-hand panel of the map for one commune: one line per indicator, in plain words, with a written verdict. */
function CommuneCard({
  c,
  deptName,
  deptValues,
  refs,
  directions,
  onClose,
}: {
  c: Commune;
  deptName: string;
  deptValues: Record<string, number | null> | null;
  /** Reference of each indicator: median of the communes, mean of the departments for department-level ones. */
  refs: Record<string, number | null>;
  directions: Record<string, Direction | undefined>;
  onClose: () => void;
}) {
  const Line = ({ row }: { row: CardRow }) => {
    const v = row.dept ? deptValues?.[row.k] : c.values[row.k];
    const ref = refs[row.k];
    const vd = verdict(v, ref, directions[row.k]);
    const m = vd ? VERDICT[vd] : null;
    const d = row.digits ?? 1;
    return (
      <li
        className="flex items-baseline justify-between gap-3 py-1"
        title={ref != null ? `Moyenne des communes : ${fmt(ref, d)}${row.unit}${row.dept ? " (département)" : ""}` : undefined}
      >
        <span className="text-[13px] text-ink-2">{row.label}</span>
        <span className="shrink-0 text-[13px]">
          <span className="num font-semibold text-ink">{v == null ? "—" : `${fmt(v, d)}${row.unit}`}</span>
          <span className="ml-1.5 inline-block w-3 text-center text-[11px]" style={{ color: m?.text ?? "transparent" }} aria-label={m?.label}>
            {m?.mark ?? "·"}
          </span>
        </span>
      </li>
    );
  };
  const walk = walkLevelOf(c.walk_class);

  return (
    <div className="max-h-[calc(100vh-11rem)] overflow-y-auto rounded-2xl bg-white p-4 shadow-[0_8px_30px_rgba(21,23,28,0.12)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[18px] font-bold leading-tight text-ink">{c.name}</p>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {deptName} · {c.population.toLocaleString("fr-FR")} hab.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-plane" aria-label="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-plane px-3 py-2">
        <Footprints className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        <span className="flex-1 text-[13px] font-semibold text-ink">{walk ? walk.label : "Marche non évaluée"}</span>
        {walk && (
          <span className="num flex items-center gap-1.5 text-[13px] font-semibold text-ink">
            {fmt(c.values.walk_score, 1)} /20
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: walk.color }} aria-hidden />
          </span>
        )}
      </div>

      {CARD_SECTIONS.map((sec) => {
        const Icon = sec.icon;
        return (
          <section key={sec.title} className="mt-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
              <Icon className="h-3.5 w-3.5" aria-hidden /> {sec.title}
            </h3>
            <ul>
              {sec.rows.map((row) => (
                <Line key={row.k} row={row} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-3 border-t border-hairline pt-2 text-[11px] text-ink-muted">
        <span style={{ color: VERDICT.better.text }}>▲</span> mieux · <span style={{ color: VERDICT.worse.text }}>▼</span> moins bien que la
        moyenne des communes
      </p>
    </div>
  );
}

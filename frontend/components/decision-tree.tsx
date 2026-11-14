"use client";

import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/bands";
import type { FeatureKey, ModelInfo, TreeNode } from "@/lib/prediction";
import { cx } from "./ui";

export const FEATURE_SHORT: Record<FeatureKey, string> = {
  pct_65plus: "65 ans et +",
  density_km2: "Densité",
  poverty_rate: "Pauvreté",
  fastfood_per10k: "Restauration rapide",
  sport_per10k: "Équipements sportifs",
};
const UNIT_SHORT: Record<FeatureKey, string> = {
  pct_65plus: " %",
  density_km2: " hab/km²",
  poverty_rate: " %",
  fastfood_per10k: " /10k",
  sport_per10k: " /10k",
};
export const fmtFeature = (k: FeatureKey, v: number) => `${fmt(v, k === "density_km2" ? 0 : 1)}${UNIT_SHORT[k]}`;

// Sequential blue ramp (reference palette, light → dark) for predicted prevalence.
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"];
export function rampColor(v: number, min: number, max: number) {
  const t = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0.5;
  const i = Math.round(t * (RAMP.length - 1));
  return { bg: RAMP[i], fg: i >= 6 ? "#ffffff" : "#0b0b0b" };
}

const ROW_H = 132;
const LEAF_H = 92;
const INNER_H = 74;

interface Placed {
  n: TreeNode;
  x: number; // centre
  y: number; // top
  depth: number;
}

function layout(nodes: TreeNode[], COL_W: number, NODE_W: number) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed = new Map<number, Placed>();
  let leafIdx = 0;
  let maxDepth = 0;
  const walk = (id: number, depth: number): number => {
    const n = byId.get(id)!;
    maxDepth = Math.max(maxDepth, depth);
    let x: number;
    if (n.leaf) {
      x = leafIdx * COL_W + COL_W / 2;
      leafIdx += 1;
    } else {
      x = (walk(n.left!, depth + 1) + walk(n.right!, depth + 1)) / 2;
    }
    placed.set(id, { n, x, y: depth * ROW_H, depth });
    return x;
  };
  walk(0, 0);
  return { placed, width: Math.max(leafIdx * COL_W, NODE_W + 16), height: maxDepth * ROW_H + LEAF_H + 8 };
}

export function DecisionTree({
  model,
  activePath,
  activeLeaf,
  openLeaf,
  onLeafClick,
}: {
  model: ModelInfo;
  activePath: number[];
  activeLeaf: number | null;
  openLeaf: number | null;
  onLeafClick: (id: number) => void;
}) {
  // Fit the columns to the available width (min 124 px per leaf, then horizontal scroll).
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(1100);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const leafCount = Math.max(1, model.nodes.filter((n) => n.leaf).length);
  const COL_W = Math.max(124, Math.min(200, Math.floor(avail / leafCount)));
  const NODE_W = COL_W - 12;
  const { placed, width, height } = layout(model.nodes, COL_W, NODE_W);
  const onPath = new Set([...activePath, ...(activeLeaf != null ? [activeLeaf] : [])]);
  const { target_min: min, target_max: max } = model.metrics;

  const edges: { from: Placed; to: Placed; yes: boolean }[] = [];
  placed.forEach((p) => {
    if (!p.n.leaf) {
      edges.push({ from: p, to: placed.get(p.n.left!)!, yes: true });
      edges.push({ from: p, to: placed.get(p.n.right!)!, yes: false });
    }
  });

  return (
    <div ref={box} className="overflow-x-auto pb-2">
      <div className="relative mx-auto" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0" aria-hidden>
          {edges.map(({ from, to, yes }) => {
            const active = onPath.has(from.n.id) && onPath.has(to.n.id);
            const y1 = from.y + INNER_H;
            const y2 = to.y;
            const my = (y1 + y2) / 2;
            return (
              <g key={`${from.n.id}-${to.n.id}`}>
                <path
                  d={`M${from.x},${y1} C${from.x},${my} ${to.x},${my} ${to.x},${y2}`}
                  fill="none"
                  stroke={active ? "#15171C" : "#CFCFC8"}
                  strokeWidth={active ? 2.5 : 1.25}
                />
                <text
                  x={(from.x + to.x) / 2 + (yes ? -10 : 10)}
                  y={my - 4}
                  textAnchor={yes ? "end" : "start"}
                  className={cx("text-[11px]", active ? "fill-[#15171C] font-semibold" : "fill-[#7A7E87]")}
                >
                  {yes ? "oui" : "non"}
                </text>
              </g>
            );
          })}
        </svg>

        {[...placed.values()].map(({ n, x, y }) => {
          const active = onPath.has(n.id);
          const style = { left: x - NODE_W / 2, top: y, width: NODE_W };
          if (n.leaf) {
            const c = rampColor(n.value, min, max);
            return (
              <button
                key={n.id}
                onClick={() => onLeafClick(n.id)}
                aria-pressed={openLeaf === n.id}
                aria-label={`Feuille : prévalence prédite ${fmt(n.value, 2)} %, ${n.samples} départements`}
                className={cx(
                  "absolute flex flex-col items-center justify-center rounded-xl text-center transition",
                  active ? "ring-[3px] ring-[#15171C] ring-offset-2" : "hover:brightness-95",
                  openLeaf === n.id && !active && "ring-2 ring-[#3E63DD]",
                )}
                style={{ ...style, height: LEAF_H, background: c.bg, color: c.fg }}
              >
                <span className={cx("num font-semibold leading-none tracking-[-0.02em]", COL_W < 150 ? "text-lg" : "text-[22px]")}>{fmt(n.value, 2)} %</span>
                <span className="mt-1.5 text-[11px] opacity-90">prévalence prédite</span>
                <span className="text-[11px] opacity-90">{n.samples} départements</span>
              </button>
            );
          }
          const f = n.feature!;
          return (
            <div
              key={n.id}
              className={cx("absolute flex flex-col justify-center rounded-xl border bg-white px-3 text-center", active ? "border-[#15171C] border-2" : "border-hairline")}
              style={{ ...style, height: INNER_H }}
            >
              <span className={cx("font-semibold leading-tight text-ink", COL_W < 150 ? "text-[12px]" : "text-[13px]")}>
                {FEATURE_SHORT[f]} ≤ {fmtFeature(f, n.threshold!)}{" ?"}
              </span>
              <span className="num mt-1 text-[11px] text-ink-muted">
                moy. {fmt(n.value, 2)} % · {n.samples} dép.
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

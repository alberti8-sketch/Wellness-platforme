import type { BandCode } from "./types";

/** Status palette (fixed): colour never carries meaning alone — always paired with an icon + label. */
export const BAND_META: Record<BandCode, { label: string; color: string; tint: string; text: string; range: string }> = {
  best: { label: "Best", color: "#0ca30c", tint: "#e3f5e3", text: "#006300", range: "7 – 10" },
  middle: { label: "Middle", color: "#fab219", tint: "#fff3d6", text: "#7a5200", range: "4 – 6,9" },
  bad: { label: "Bad", color: "#d03b3b", tint: "#fbe4e4", text: "#a12626", range: "1 – 3,9" },
};
export const NO_DATA_COLOR = "#e1e0d9";
export const BAND_ORDER: BandCode[] = ["best", "middle", "bad"];

export function bandOf(score: number | null | undefined): BandCode | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (score >= 7) return "best";
  if (score >= 4) return "middle";
  return "bad";
}

export const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export const STATUS_LABEL: Record<string, string> = {
  RECEIVED: "Reçu",
  VALIDATED: "Validé",
  CLEANED: "Nettoyé",
  NORMALIZED: "Normalisé",
  AGGREGATED: "Agrégé",
  PENDING_APPROVAL: "En attente de validation",
  PUBLISHED: "Publié",
  REJECTED: "Rejeté",
  FAILED: "Échec",
};

export const FLAG_LABEL: Record<string, string> = {
  missing: "Valeur manquante",
  out_of_reference: "Hors plage de référence (score borné)",
  outlier: "Valeur atypique",
  overridden: "Corrigée par un administrateur",
};

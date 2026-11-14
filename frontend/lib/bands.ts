import type { BandCode } from "./types";

/** Status palette (fixed): colour never carries meaning alone — always paired with an icon + label. */
export const BAND_META: Record<BandCode, { label: string; color: string; tint: string; text: string; range: string }> = {
  best: { label: "Best", color: "#1F8A78", tint: "#DDF0EA", text: "#0E5A50", range: "7 – 10" },
  middle: { label: "Middle", color: "#D4A33A", tint: "#F6EDD3", text: "#6E5110", range: "4 – 6,9" },
  bad: { label: "Bad", color: "#C8513A", tint: "#FBE6DF", text: "#9A2F1C", range: "1 – 3,9" },
};
export const NO_DATA_COLOR = "#E2E2DC";
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

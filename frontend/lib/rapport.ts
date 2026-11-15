"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session";
import { api } from "./api";
import { useLoad } from "./prediction";

export interface Evidence {
  maladie: string;
  habitude: string;
  association: string;
  niveau: string;
}

export interface Disease {
  key: string;
  label: string;
  kind: string;
  year: number;
  prev: number;
  prev_france: number | null;
  ratio_france: number | null;
  trend_from_year: number;
  trend_from: number;
  trend_pts: number;
  people_department: number | null;
  people_commune_est: number | null;
  evidence: Evidence[];
}

export interface Report {
  code: string;
  name: string;
  departement: { code: string; name: string | null };
  type: string | null;
  population: number | null;
  period: number;
  score: { value: number | null; band: string | null; rank: number; of: number; average: number | null };
  dimensions: { code: string; label: string; weight: number | null; score: number | null; average: number | null }[];
  food: Record<string, number | string | null>;
  mobility: Record<string, number | string | null>;
  land: Record<string, number | null>;
  sport: { equipment_10k: number | null; practice_rate_size: number | null; size_class: string | null };
  care: { gp_10k: number | null };
  prevention: Record<string, number | string | null>;
  references: { communes_median: Record<string, number>; departements_mean: Record<string, number>; communes_scope?: string };
  diseases: { departement: string; source: string; items: Disease[] };
  findings: { strengths: string[]; weaknesses: string[] };
  determinants: Determinant[];
  disease_links: DiseaseLinks[];
  comparison: Comparison;
}

export const useReport = (code: string | null) => useLoad<Report>(code ? `rapport:${code}` : null, () => api.get<Report>(`/api/rapport?ville=${code}`));

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Parsed answer of the assistant (cards and diagrams); the raw text stays in `content` for the history. */
  structured?: Structured | null;
}
/** Ask a question; the server saves it with the answer in the conversation (created when `conversationId` is null). */
export const askAssistant = (ville: string, question: string, conversationId: string | null) =>
  api.post<{ reply: string; structured: Structured | null; model: string; conversation_id: string; title: string }>("/api/assistant/chat", {
    ville,
    question,
    conversation_id: conversationId,
  });

export interface ConversationSummary {
  id: string;
  title: string;
  ville: string;
  ville_nom: string | null;
  messages: number;
  updated_at: string;
}
export const listConversations = () => api.get<ConversationSummary[]>("/api/assistant/conversations");
export const getConversation = (id: string) =>
  api.get<ConversationSummary & { items: (ChatMessage & { at?: string })[] }>(`/api/assistant/conversations/${id}`);
export const deleteConversation = (id: string) => api.del(`/api/assistant/conversations/${id}`);
export const useAssistantStatus = () => useLoad<{ configured: boolean; model: string }>("assistant-status", () => api.get("/api/assistant/status"));

/** The commune the pages are about: ?ville= in the URL, else the signed-in account's commune. */
export function useCurrentCity(): [string | null, (code: string | null) => void] {
  const { account } = useSession();
  const [city, setCity] = useState<string | null>(null);
  const [fromUrl, setFromUrl] = useState(false);
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("ville");
      if (v) {
        setCity(v.toUpperCase());
        setFromUrl(true);
      }
    } catch {
      /* no URL access */
    }
  }, []);
  useEffect(() => {
    if (!fromUrl && !city && account) setCity(account.city_code);
  }, [account, city, fromUrl]);
  const set = (code: string | null) => {
    setCity(code);
    try {
      const url = new URL(window.location.href);
      if (code) url.searchParams.set("ville", code);
      else url.searchParams.delete("ville");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* no URL access */
    }
  };
  return [city, set];
}

export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));

// ---- Determinants, disease links, comparison with similar cities, structured assistant answers ----
export type DetStatus = "favorable" | "defavorable" | "moyen" | "nc";
export interface Determinant {
  key: string;
  label: string;
  status: DetStatus;
  indicators: { key: string; label: string; unit: string; direction: "up" | "down"; scope: string; value: number | null; reference: number | null; status: DetStatus }[];
}
export interface DiseaseLinks {
  key: string;
  label: string;
  prev: number;
  prev_france: number | null;
  trend_pts: number;
  links: { determinant: string; label: string; level: string; habits: string[]; status: DetStatus; source: string }[];
}
export interface Comparison {
  cities: { code: string; name: string; type: string | null; population: number | null; self: boolean; score: number | null; values: Record<string, number | null>; diseases: Record<string, number> }[];
  indicators: { key: string; label: string; unit: string; direction: "up" | "down"; scope?: string; theme?: string; theme_label?: string }[];
  diseases: { key: string; label: string }[];
  method: string;
}
export interface Priority {
  titre: string;
  maladies: string[];
  determinant: string;
  constat: string;
  action: string;
  preuve: string;
  niveau_preuve: string;
  comparaison: string;
  indicateur: string;
  horizon: string;
}
export interface Structured {
  synthese: string;
  priorites: Priority[];
  a_retenir: string;
}

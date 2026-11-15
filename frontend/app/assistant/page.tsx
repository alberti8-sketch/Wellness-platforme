"use client";

import { ArrowUp, Lightbulb, MessageSquarePlus, Trash2 } from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAnalytics } from "@/components/analytics";
import { CitySearch } from "@/components/city-search";
import { StructuredAnswer } from "@/components/assistant-answer";
import { Markdown } from "@/components/markdown";
import { ErrorBox, PageHeader, Spinner, cx } from "@/components/ui";
import {
  type ChatMessage,
  type ConversationSummary,
  askAssistant,
  deleteConversation,
  getConversation,
  listConversations,
  useAssistantStatus,
  useCurrentCity,
  useReport,
} from "@/lib/rapport";

const when = (iso: string) => {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1)
    return `aujourd'hui, ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  if (days < 2) return "hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};

/** Starter questions built from the report's weak points. */
function suggestions(name: string, weaknesses: string[]): string[] {
  const out = [
    `Quelles sont les 3 actions prioritaires pour la santé à ${name} ?`,
  ];
  for (const w of weaknesses.slice(0, 3))
    out.push(`Que faire pour : ${w.split(" : ")[0].toLowerCase()} ?`);
  out.push("Comment augmenter la participation au dépistage des cancers ?");
  return [...new Set(out)].slice(0, 4);
}

export default function AssistantPage() {
  const { territories } = useAnalytics();
  const [city, setCity] = useCurrentCity();
  const report = useReport(city);
  const status = useAssistantStatus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  // Saved conversations (history) and the one shown.
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const refresh = useCallback(() => {
    listConversations()
      .then(setHistory)
      .catch(() => undefined);
  }, []);
  useEffect(refresh, [refresh]);

  const startNew = () => {
    setCurrent(null);
    setMessages([]);
    setError(null);
  };
  const openConversation = async (id: string) => {
    setError(null);
    try {
      const c = await getConversation(id);
      setCurrent(c.id);
      setMessages(
        c.items.map(({ role, content, structured }) => ({
          role,
          content,
          structured,
        })),
      );
      if (c.ville !== city) setCity(c.ville);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Supprimer cette conversation ?")) return;
    try {
      await deleteConversation(id);
      if (id === current) startNew();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const send = async (text: string) => {
    if (!city || !text.trim() || busy) return;
    const next: ChatMessage[] = [
      ...messages,
      { role: "user", content: text.trim() },
    ];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const r = await askAssistant(city, text.trim(), current);
      setCurrent(r.conversation_id);
      setMessages([
        ...next,
        { role: "assistant", content: r.reply, structured: r.structured },
      ]);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A question passed from the diseases page (?question=…) is sent once the commune is known.
  useEffect(() => {
    if (asked.current || !city || !status.data?.configured) return;
    try {
      const q = new URLSearchParams(window.location.search).get("question");
      if (q) {
        asked.current = true;
        void send(q);
      }
    } catch {
      /* no URL access */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, status.data]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const name = report.data?.name ?? "votre commune";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        title="Solutions"
        subtitle={`Un assistant qui propose des actions pour ${name}, à partir du rapport de la commune et de la base de preuves de l'équipe.`}
        actions={
          <>
            <CitySearch
              territories={territories}
              value={city}
              onPick={(c) => {
                setCity(c);
                startNew();
              }}
              placeholder="Changer de commune"
            />
          </>
        }
      />

      {status.data && !status.data.configured && (
        <ErrorBox>
          Assistant non configuré : ajoutez OPENROUTER_API_KEY dans backend/.env
          puis redémarrez l&apos;API.
        </ErrorBox>
      )}

      <div className="grid flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="flex flex-col rounded-card border border-hairline bg-white p-3 lg:max-h-[calc(100vh-11rem)]"
          aria-label="Historique des conversations"
        >
          <button
            onClick={startNew}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-ink px-3 text-sm font-semibold text-white hover:bg-black"
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden /> Nouvelle
            conversation
          </button>
          <p className="mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Historique
          </p>
          <ul className="mt-2 flex-1 space-y-1 overflow-y-auto">
            {history.length === 0 && (
              <li className="px-1 py-2 text-sm text-ink-muted">
                Vos conversations apparaîtront ici.
              </li>
            )}
            {history.map((c) => (
              <li key={c.id} className="group relative">
                <button
                  onClick={() => void openConversation(c.id)}
                  aria-current={c.id === current ? "true" : undefined}
                  className={cx(
                    "w-full rounded-xl px-3 py-2.5 pr-9 text-left",
                    c.id === current ? "bg-plane" : "hover:bg-[#FAFAF7]",
                  )}
                >
                  <span className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">
                    {c.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {c.ville_nom ?? c.ville} · {when(c.updated_at)}
                  </span>
                </button>
                <button
                  onClick={() => void remove(c.id)}
                  className="absolute right-1.5 top-2 grid h-7 w-7 place-items-center rounded-lg text-ink-faint opacity-0 hover:bg-white hover:text-[#9A2F1C] focus:opacity-100 group-hover:opacity-100"
                  aria-label={`Supprimer la conversation « ${c.title} »`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-col rounded-card border border-hairline bg-white">
          <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-7">
            {messages.length === 0 && (
              <div className="mx-auto max-w-[640px] py-6 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-plane">
                  <Lightbulb className="h-5 w-5 text-ink" aria-hidden />
                </span>
                <p className="mt-3 text-[17px] font-semibold text-ink">
                  Que voulez-vous améliorer à {name} ?
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Les réponses s&apos;appuient sur les chiffres de la commune
                  (score, maladies, alimentation, dépistage, marche, vélo,
                  sport).
                </p>
                {report.data && (
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {suggestions(
                      report.data.name,
                      report.data.findings.weaknesses,
                    ).map((s) => (
                      <button
                        key={s}
                        onClick={() => void send(s)}
                        disabled={busy || !status.data?.configured}
                        className="rounded-full border border-hairline px-3.5 py-2 text-left text-[13px] text-ink-2 hover:border-ink-faint hover:text-ink disabled:opacity-50"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[14px] text-white">
                    {m.content}
                  </p>
                </div>
              ) : (
                <div
                  key={i}
                  className={
                    m.structured
                      ? "rounded-2xl rounded-bl-md bg-plane p-3 md:p-4"
                      : "max-w-[860px] rounded-2xl rounded-bl-md bg-plane px-5 py-4"
                  }
                >
                  {m.structured ? (
                    <StructuredAnswer s={m.structured} />
                  ) : (
                    <Markdown text={m.content} />
                  )}
                </div>
              ),
            )}
            {busy && <Spinner label="L'assistant prépare des solutions…" />}
            {error && <ErrorBox>{error}</ErrorBox>}
            <div ref={end} />
          </div>

          <form
            onSubmit={submit}
            className="flex items-end gap-2 border-t border-hairline p-3 md:p-4"
          >
            <label className="sr-only" htmlFor="question">
              Votre question
            </label>
            <textarea
              id="question"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              placeholder={`Ex. : comment réduire le diabète à ${name} ?`}
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-hairline px-3.5 py-3 text-[14px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10"
            />
            <button
              type="submit"
              disabled={
                busy || !input.trim() || !city || !status.data?.configured
              }
              className="grid h-12 w-12 place-items-center rounded-xl bg-ink text-white hover:bg-black disabled:opacity-40"
              aria-label="Envoyer"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Réponses générées par IA via OpenRouter ({status.data?.model ?? "…"}), à
        vérifier. Seules les données publiques agrégées de la commune sont
        envoyées. Les conversations sont enregistrées sur la plateforme,
        visibles par vous seul.
      </p>
    </div>
  );
}

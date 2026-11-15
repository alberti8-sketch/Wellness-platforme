"use client";

import { ArrowUp, Lightbulb, MapPin, SquarePen, Trash2 } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/components/analytics";
import { StructuredAnswer } from "@/components/assistant-answer";
import { CitySearch } from "@/components/city-search";
import { Markdown } from "@/components/markdown";
import { cx } from "@/components/ui";
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

/** History groups, like a chat app: today, last 7 days, older. */
function groupOf(iso: string) {
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  return days < 1 ? "Aujourd'hui" : days < 7 ? "7 derniers jours" : "Plus ancien";
}

/** Starter questions built from the report's weak points. */
function suggestions(name: string, weaknesses: string[]): string[] {
  const out = [`Quelles sont les 3 actions prioritaires pour la santé à ${name} ?`];
  for (const w of weaknesses.slice(0, 2)) out.push(`Que faire pour : ${w.split(" : ")[0].toLowerCase()} ?`);
  out.push("Comment augmenter la participation au dépistage des cancers ?");
  return [...new Set(out)].slice(0, 4);
}

/** Message box: grows with the text; Enter sends, Shift+Enter adds a line. */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  city,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  city: string | null;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSend();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  return (
    <form onSubmit={submit} className="rounded-[22px] border border-[#E2E0D8] bg-white px-4 pb-3 pt-3.5 shadow-[0_2px_12px_rgba(21,23,28,0.06)] focus-within:border-[#C9C6BB]">
      <label className="sr-only" htmlFor="question">
        Votre question
      </label>
      <textarea
        id="question"
        ref={ref}
        rows={1}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        className="block max-h-[200px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-plane px-2.5 py-1 text-[12px] text-ink-2">
          <MapPin className="h-3.5 w-3.5" aria-hidden /> {city ?? "Choisir une commune"}
        </span>
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="grid h-9 w-9 place-items-center rounded-full bg-ink text-white transition hover:bg-black disabled:bg-[#D9D7CF]"
          aria-label="Envoyer"
        >
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      </div>
    </form>
  );
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
      setMessages(c.items.map(({ role, content, structured }) => ({ role, content, structured })));
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
    const next: ChatMessage[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setError(null);
    setBusy(true);
    try {
      const r = await askAssistant(city, text.trim(), current);
      setCurrent(r.conversation_id);
      setMessages([...next, { role: "assistant", content: r.reply, structured: r.structured }]);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A question passed from another page (?question=…) is sent once the commune is known.
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
  const ready = !!city && !!status.data?.configured;
  const groups = ["Aujourd'hui", "7 derniers jours", "Plus ancien"]
    .map((g) => ({ g, items: history.filter((c) => groupOf(c.updated_at) === g) }))
    .filter((x) => x.items.length);

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-[600px] bg-[#FAF9F6]">
      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-3">
          <p className="truncate text-[14px] font-medium text-ink-2">
            {current ? history.find((c) => c.id === current)?.title ?? "Conversation" : "Solutions"}
          </p>
          <CitySearch
            territories={territories}
            value={city}
            onPick={(c) => {
              setCity(c);
              startNew();
            }}
            placeholder="Changer de commune"
          />
        </header>

        {status.data && !status.data.configured && (
          <p className="mx-auto mb-2 max-w-[760px] rounded-xl bg-[#FBE6DF] px-4 py-2.5 text-[13px] text-[#9A2F1C]">
            Assistant non configuré : ajoutez OPENROUTER_API_KEY dans backend/.env puis redémarrez l&apos;API.
          </p>
        )}

        {messages.length === 0 ? (
          // Welcome screen: greeting, centred message box, suggestions.
          <div className="flex flex-1 flex-col items-center justify-center px-5 pb-16">
            <div className="w-full max-w-[720px]">
              <h1 className="flex items-center justify-center gap-3 text-center text-[30px] font-semibold tracking-[-0.02em] text-ink md:text-[34px]">
                <Lightbulb className="h-8 w-8 text-[#D9592B]" aria-hidden />
                Que voulez-vous améliorer à {name} ?
              </h1>
              <div className="mt-8">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={() => void send(input)}
                  disabled={busy || !ready}
                  placeholder={`Posez votre question sur la santé à ${name}…`}
                  city={report.data?.name ?? null}
                  autoFocus
                />
              </div>
              {report.data && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {suggestions(report.data.name, report.data.findings.weaknesses).map((s) => (
                    <button
                      key={s}
                      onClick={() => void send(s)}
                      disabled={busy || !ready}
                      className="rounded-full border border-[#E2E0D8] bg-white px-3.5 py-1.5 text-[13px] text-ink-2 hover:border-[#C9C6BB] hover:text-ink disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5">
              <div className="mx-auto max-w-[760px] space-y-7 py-6">
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[#EFEDE6] px-4 py-2.5 text-[15px] leading-relaxed text-ink">{m.content}</p>
                    </div>
                  ) : (
                    <div key={i} className="flex gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FCEDE6] text-[#D9592B]" aria-hidden>
                        <Lightbulb className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">{m.structured ? <StructuredAnswer s={m.structured} /> : <Markdown text={m.content} />}</div>
                    </div>
                  ),
                )}
                {busy && (
                  <div className="flex items-center gap-3 text-[14px] text-ink-muted">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-[#FCEDE6] text-[#D9592B]" aria-hidden>
                      <Lightbulb className="h-4 w-4 animate-pulse" />
                    </span>
                    Réflexion en cours…
                  </div>
                )}
                {error && <p className="rounded-xl bg-[#FBE6DF] px-4 py-2.5 text-[13px] text-[#9A2F1C]">{error}</p>}
                <div ref={end} />
              </div>
            </div>
            <div className="px-5 pb-4 pt-2">
              <div className="mx-auto max-w-[760px]">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={() => void send(input)}
                  disabled={busy || !ready}
                  placeholder="Répondre…"
                  city={report.data?.name ?? null}
                />
                <p className="mt-2 text-center text-[11px] text-ink-faint">
                  Réponses générées par IA ({status.data?.model ?? "…"}), à vérifier. Seules les données publiques de la commune sont envoyées ; vos conversations restent privées.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* History, on the right */}
      <aside className="hidden w-[260px] shrink-0 flex-col border-l border-[#ECEAE3] bg-[#F4F3EF] p-3 md:flex" aria-label="Historique des conversations">
        <button onClick={startNew} className="flex h-10 items-center gap-2.5 rounded-xl px-3 text-[14px] font-medium text-ink hover:bg-[#E9E7E0]">
          <SquarePen className="h-[18px] w-[18px]" aria-hidden /> Nouvelle conversation
        </button>
        <div className="mt-3 flex-1 overflow-y-auto">
          {history.length === 0 && <p className="px-3 py-2 text-[13px] text-ink-muted">Vos conversations apparaîtront ici.</p>}
          {groups.map(({ g, items }) => (
            <div key={g} className="mb-3">
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold text-ink-faint">{g}</p>
              <ul>
                {items.map((c) => (
                  <li key={c.id} className="group relative">
                    <button
                      onClick={() => void openConversation(c.id)}
                      aria-current={c.id === current ? "true" : undefined}
                      title={`${c.title} · ${c.ville_nom ?? c.ville}`}
                      className={cx("w-full truncate rounded-lg py-2 pl-3 pr-8 text-left text-[13.5px]", c.id === current ? "bg-[#E6E4DC] text-ink" : "text-ink-2 hover:bg-[#ECEAE3]")}
                    >
                      {c.title}
                    </button>
                    <button
                      onClick={() => void remove(c.id)}
                      className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-ink-faint opacity-0 hover:text-[#9A2F1C] focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Supprimer « ${c.title} »`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

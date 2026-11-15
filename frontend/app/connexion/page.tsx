"use client";

import { Activity, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { type Account, useSession } from "@/components/session";
import { api } from "@/lib/api";
import { TYPE_LABEL } from "@/lib/metrics";

interface Options {
  jobs: string[];
  cities: { code: string; name: string; type: string | null }[];
}
type Mode = "login" | "register";

const field = "h-11 w-full rounded-xl border border-hairline bg-white px-3.5 text-[15px] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-ink/10";

/** Sign in, or create an account (e-mail, password, role in the town hall, commune). */
export default function ConnexionPage() {
  const { loggedIn, authReady, signIn, login } = useSession();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [opts, setOpts] = useState<Options | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [job, setJob] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // First page after signing in: the map (zoomed on the account's commune).
    if (authReady && loggedIn) router.replace("/carte");
  }, [authReady, loggedIn, router]);

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("mode") === "inscription") setMode("register");
    } catch {
      /* no URL access */
    }
    api
      .get<Options>("/api/auth/options")
      .then((o) => {
        setOpts(o);
        setJob((j) => j || o.jobs[0]);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = mode === "login" ? { email, password } : { email, password, job, city_code: city };
      const res = await api.post<{ token: string; user: Account }>(mode === "login" ? "/api/auth/login" : "/api/auth/register", body);
      signIn(res.token, res.user);
      // The redirect effect above then opens the map, zoomed on the commune.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-plane text-ink">
      <header className="px-5 py-6 md:px-12">
        <Link href="/" className="mx-auto flex max-w-[1180px] items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-ink text-white" aria-hidden>
            <Activity className="h-[18px] w-[18px]" />
          </span>
          <span className="text-lg font-semibold">Wellness</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 md:pt-12">
        <div className="w-full max-w-[440px]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">{mode === "login" ? "Se connecter" : "Créer un compte"}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            {mode === "login" ? "Retrouvez les données de santé de votre commune." : "Pour les maires et leurs équipes municipales."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-[#EDEDE8] p-1" role="tablist" aria-label="Connexion ou inscription">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`h-10 rounded-lg text-sm font-medium transition ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4 rounded-2xl border border-hairline bg-white p-6">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Adresse e-mail
              <input className={field} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@mairie.fr" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Mot de passe
              <input
                className={field}
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "register" && <span className="text-xs font-normal text-ink-muted">8 caractères minimum</span>}
            </label>

            {mode === "register" && (
              <>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Fonction
                  <select className={field} required value={job} onChange={(e) => setJob(e.target.value)}>
                    {(opts?.jobs ?? []).map((j) => (
                      <option key={j} value={j}>
                        {j}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Votre commune
                  <select className={field} required value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="" disabled>
                      Choisir une commune
                    </option>
                    {(opts?.cities ?? []).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                        {c.type ? ` · ${TYPE_LABEL[c.type] ?? c.type}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-normal text-ink-muted">Les {opts?.cities.length ?? "…"} communes suivies par la plateforme.</span>
                </label>
              </>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-[#FBE6DF] px-3.5 py-2.5 text-sm text-[#9A2F1C]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-ink font-semibold text-white hover:bg-black disabled:opacity-60"
            >
              {busy ? "Un instant…" : mode === "login" ? "Se connecter" : "Créer mon compte"}
              {!busy && <ArrowRight className="h-[18px] w-[18px]" aria-hidden />}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-muted">
            Simple visite ?{" "}
            <button
              onClick={() => {
                login();
                router.push("/carte");
              }}
              className="font-medium text-ink underline-offset-2 hover:underline"
            >
              Accéder à la démo
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

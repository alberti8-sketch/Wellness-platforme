"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiKey as setClientKey, setToken as setClientToken } from "@/lib/api";
import type { Catalog, Me } from "@/lib/types";

export const DEMO_ACCOUNTS = [
  { key: "demo-b2g-admin", label: "B2G · Admin (ORS)" },
  { key: "demo-b2g-contrib", label: "B2G · Contributeur (ORS)" },
  { key: "demo-b2b-admin", label: "B2B · Admin (QVT entreprise)" },
];
const STORAGE_KEY = "wellness.apiKey";
const TOKEN_KEY = "wellness.token";

/** A signed-in account (e-mail / password). */
export interface Account {
  email: string;
  job: string;
  city_code: string;
  city_name: string | null;
}

interface Session {
  apiKey: string;
  setApiKey: (k: string) => void;
  me: Me | null;
  catalog: Catalog | null;
  error: string | null;
  ready: boolean;
  isAdmin: boolean;
  /** Signed in with an account (token) or through the demo access. */
  loggedIn: boolean;
  authReady: boolean;
  /** The signed-in account, null for the demo access. */
  account: Account | null;
  /** Demo access (one click, demo API key). */
  login: () => void;
  /** Account sign-in: keep the session token and profile. */
  signIn: (token: string, account: Account) => void;
  logout: () => void;
}

const AUTH_KEY = "wellness.signedIn";

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState(DEMO_ACCOUNTS[0].key);
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [token, setTokenState] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [demo, setDemo] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Keep the API client in sync synchronously so child effects use the right credentials.
  setClientKey(apiKey);
  setClientToken(token);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setKey(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    let cancelled = false;
    setMe(null);
    setError(null);
    Promise.all([api.get<Me>("/api/me"), api.get<Catalog>("/api/analytics/catalog")])
      .then(([m, c]) => {
        if (cancelled) return;
        setMe(m);
        setCatalog(c);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, token, authChecked]);

  const setApiKey = useCallback((k: string) => {
    setKey(k);
    try {
      window.localStorage.setItem(STORAGE_KEY, k);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Restore the session: a saved account token is checked against the API before use.
  useEffect(() => {
    let saved = "";
    try {
      setDemo(window.localStorage.getItem(AUTH_KEY) === "1");
      saved = window.localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      /* storage unavailable: signed out */
    }
    if (!saved) {
      setAuthChecked(true);
      return;
    }
    setClientToken(saved);
    api
      .get<Account>("/api/auth/me")
      .then((a) => {
        setTokenState(saved);
        setAccount(a);
      })
      .catch(() => {
        setClientToken("");
        try {
          window.localStorage.removeItem(TOKEN_KEY);
        } catch {
          /* storage unavailable */
        }
      })
      .finally(() => setAuthChecked(true));
  }, []);
  const loggedIn = !!account || demo;
  const authReady = authChecked;
  const login = useCallback(() => {
    setDemo(true);
    try {
      window.localStorage.setItem(AUTH_KEY, "1");
    } catch {
      /* storage unavailable: session-only sign-in */
    }
  }, []);
  const signIn = useCallback((t: string, a: Account) => {
    setClientToken(t);
    setTokenState(t);
    setAccount(a);
    try {
      window.localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* storage unavailable: session-only sign-in */
    }
  }, []);
  const logout = useCallback(() => {
    if (token) void api.post("/api/auth/logout").catch(() => undefined);
    setClientToken("");
    setTokenState("");
    setAccount(null);
    setDemo(false);
    try {
      window.localStorage.removeItem(AUTH_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }, [token]);

  const value = useMemo<Session>(
    () => ({
      apiKey,
      setApiKey,
      me,
      catalog,
      error,
      ready: !!me && !!catalog,
      isAdmin: me?.role === "admin",
      loggedIn,
      authReady,
      account,
      login,
      signIn,
      logout,
    }),
    [apiKey, setApiKey, me, catalog, error, loggedIn, authReady, account, login, signIn, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setApiKey as setClientKey } from "@/lib/api";
import type { Catalog, Me } from "@/lib/types";

export const DEMO_ACCOUNTS = [
  { key: "demo-b2g-admin", label: "B2G · Admin (ORS)" },
  { key: "demo-b2g-contrib", label: "B2G · Contributeur (ORS)" },
  { key: "demo-b2b-admin", label: "B2B · Admin (QVT entreprise)" },
];
const STORAGE_KEY = "wellness.apiKey";

interface Session {
  apiKey: string;
  setApiKey: (k: string) => void;
  me: Me | null;
  catalog: Catalog | null;
  error: string | null;
  ready: boolean;
  isAdmin: boolean;
  /** Demo sign-in: a flag remembered in this browser (replace with real auth / SSO). */
  loggedIn: boolean;
  authReady: boolean;
  login: () => void;
  logout: () => void;
}

const AUTH_KEY = "wellness.signedIn";

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState(DEMO_ACCOUNTS[0].key);
  const [me, setMe] = useState<Me | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the API client in sync synchronously so child effects use the right key.
  setClientKey(apiKey);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setKey(stored);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
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
  }, [apiKey]);

  const setApiKey = useCallback((k: string) => {
    setKey(k);
    try {
      window.localStorage.setItem(STORAGE_KEY, k);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  useEffect(() => {
    try {
      setLoggedIn(window.localStorage.getItem(AUTH_KEY) === "1");
    } catch {
      /* storage unavailable: signed out */
    }
    setAuthReady(true);
  }, []);
  const login = useCallback(() => {
    setLoggedIn(true);
    try {
      window.localStorage.setItem(AUTH_KEY, "1");
    } catch {
      /* storage unavailable: session-only sign-in */
    }
  }, []);
  const logout = useCallback(() => {
    setLoggedIn(false);
    try {
      window.localStorage.removeItem(AUTH_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

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
      login,
      logout,
    }),
    [apiKey, setApiKey, me, catalog, error, loggedIn, authReady, login, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

"use client";

// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-04,
// GET /auth/me added 2026-09-23.
//
//   POST /auth/login  { email, password, school_slug }  credentials:'include'
//     -> 200: data.access_token, data.expires_in (seconds, 900), data.user, data.school
//        (data.school now includes logo_url, confirmed 2026-09-23)
//     -> 401 UNAUTHORIZED / 422 VALIDATION_ERROR / 429 RATE_LIMITED (Retry-After header)
//
//   POST /auth/refresh  {}  credentials:'include'  (refresh token is an
//   httpOnly cookie the backend set on login — never touched from the frontend)
//     -> 200: new data.access_token, data.expires_in. Cookie rotates automatically.
//        Only a token — no user/school, which is why /auth/me exists below.
//     -> 401/422: session dead.
//
//   GET /auth/me  Bearer auth (via apiFetch)
//     -> 200: data.user, data.school (name, slug, logo_url) — used to
//        restore user/school after a reload, since /auth/refresh alone
//        can't. See restoreSession below.
//
//   POST /auth/logout  credentials:'include'  (clears the cookie backend-side)
//
// The access token lives ONLY in this provider's React state — never
// localStorage/sessionStorage/a cookie we set. That's what makes a page
// reload lose it, which is why AuthGate (src/components/auth/AuthGate.tsx)
// does a silent /auth/refresh on first load of a protected route: the
// httpOnly refresh cookie survives the reload even though this state doesn't.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api/config";
import { apiFetch } from "@/lib/api/client";
import { getAccessToken, setAccessToken, registerAuthBridge, DEV_AUTH_BYPASS } from "./authBridge";

export type AuthUser = Record<string, unknown> & { id?: string; email?: string };
// logo_url confirmed present (login's data.school and /auth/me's data.school
// both include it, per Muntajir 2026-09-23) — no longer the "unconfirmed"
// guess it was when the sidebar brand was first wired.
export type AuthSchool = Record<string, unknown> & {
  id?: string;
  slug?: string;
  name?: string;
  logo_url?: string;
};

export type LoginErrorReason =
  | "invalid_credentials"
  | "validation_error"
  | "rate_limited"
  | "network_error"
  | "unknown_error";

export class LoginError extends Error {
  reason: LoginErrorReason;
  serverMessage?: string;
  retryAfterSeconds?: number;

  constructor(
    reason: LoginErrorReason,
    opts?: { serverMessage?: string; retryAfterSeconds?: number },
  ) {
    super(reason);
    this.reason = reason;
    this.serverMessage = opts?.serverMessage;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
  }
}

type AuthStatus = "idle" | "restoring" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  school: AuthSchool | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (email: string, password: string, schoolSlug: string) => Promise<void>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// DEV-ONLY mock session seeded by DEV_AUTH_BYPASS (now defined in
// authBridge.ts — see that file for why). Clearly-fake values so they're
// unmistakable in the UI. The token itself is inert here; it's on each
// authenticated caller (e.g. settingsApi.ts) to check DEV_AUTH_BYPASS
// before ever handing it to apiFetch, so it's never actually sent to a
// real backend.
const DEV_MOCK_USER: AuthUser = {
  id: "dev-user",
  email: "dev@demo-school.local",
  name: "Dev User",
};

const DEV_MOCK_SCHOOL: AuthSchool = {
  id: "t_demo",
  slug: "demo-school",
  name: "Demo School",
};

const DEV_MOCK_ACCESS_TOKEN = "dev-bypass-token-never-sent-to-a-real-backend";

function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [school, setSchool] = useState<AuthSchool | null>(null);
  const [status, setStatus] = useState<AuthStatus>("idle");

  const clearLocalAuth = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setSchool(null);
    setStatus("unauthenticated");
  }, []);

  // Used both by restoreSession (silent, on load) and by the API client
  // (reactive, on a 401) — this is the ONE place that calls /auth/refresh.
  const refresh = useCallback(async (): Promise<{ accessToken: string } | null> => {
    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) return null;

      const body = await response.json().catch(() => null);
      const token = body?.data?.access_token;
      if (typeof token !== "string") return null;

      setAccessToken(token);
      return { accessToken: token };
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    registerAuthBridge({ refresh, forceLogout: clearLocalAuth });
  }, [refresh, clearLocalAuth]);

  // Only called from restoreSession, right after a successful refresh (so
  // apiFetch has a fresh token to attach). Failure here is NEVER fatal to
  // the session — refresh already proved it valid, so a failed /auth/me is
  // treated as "user/school stay null", not a logout. See the long comment
  // on restoreSession below for why. If /auth/me genuinely 401s, apiFetch's
  // own refresh-and-retry-then-force-logout chain has already run by the
  // time this returns — nothing more to do here in that case either.
  const fetchCurrentUser = useCallback(async (): Promise<{
    user: AuthUser | null;
    school: AuthSchool | null;
  } | null> => {
    try {
      const response = await apiFetch("auth/me");
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return { user: body?.data?.user ?? null, school: body?.data?.school ?? null };
    } catch {
      return null;
    }
  }, []);

  const restoreSession = useCallback(async (): Promise<boolean> => {
    // DEV-ONLY auth bypass — double-gated on NODE_ENV==="development" AND
    // NEXT_PUBLIC_DEV_AUTH_BYPASS==="true". MUST NEVER activate in
    // production. Skips the real /auth/refresh (which can't succeed on
    // localhost — no session cookie + CORS) and seeds a mock authenticated
    // session instead, so AuthGate never hits the network or redirects.
    // Returns before ever reaching /auth/me below — the mock path is fully
    // isolated from the real network calls, same as it always was.
    if (DEV_AUTH_BYPASS) {
      setAccessToken(DEV_MOCK_ACCESS_TOKEN);
      setUser(DEV_MOCK_USER);
      setSchool(DEV_MOCK_SCHOOL);
      setStatus("authenticated");
      return true;
    }

    setStatus("restoring");
    const result = await refresh();
    if (!result) {
      clearLocalAuth();
      return false;
    }

    // /auth/refresh only returns a token, not user/school — /auth/me fills
    // that in so a reload restores the full context (sidebar name/logo
    // included), not just route access. A failed /auth/me here degrades to
    // exactly the old pre-/auth/me behavior (authenticated, user/school
    // null) rather than blocking the reload or forcing a logout over what
    // might be a transient failure in a call that already isn't route-
    // protection-critical.
    const me = await fetchCurrentUser();
    setUser(me?.user ?? null);
    setSchool(me?.school ?? null);
    setStatus("authenticated");
    return true;
  }, [refresh, clearLocalAuth, fetchCurrentUser]);

  const login = useCallback(async (email: string, password: string, schoolSlug: string) => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, school_slug: schoolSlug }),
      });
    } catch {
      throw new LoginError("network_error");
    }

    const body = await response.json().catch(() => null);

    if (response.ok && typeof body?.data?.access_token === "string") {
      setAccessToken(body.data.access_token);
      setUser(body.data.user ?? null);
      setSchool(body.data.school ?? null);
      setStatus("authenticated");
      return;
    }

    if (response.status === 401) {
      throw new LoginError("invalid_credentials");
    }
    if (response.status === 422) {
      throw new LoginError("validation_error", { serverMessage: body?.message });
    }
    if (response.status === 429) {
      throw new LoginError("rate_limited", { retryAfterSeconds: readRetryAfterSeconds(response) });
    }
    throw new LoginError("unknown_error");
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Best-effort — clear local state regardless of whether this reaches the server.
    }
    clearLocalAuth();
    router.push("/login");
  }, [clearLocalAuth, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      school,
      status,
      isAuthenticated: status === "authenticated",
      login,
      logout,
      restoreSession,
    }),
    [user, school, status, login, logout, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

// Re-exported for callers that need the raw token outside React (e.g. non-hook utilities).
export { getAccessToken };

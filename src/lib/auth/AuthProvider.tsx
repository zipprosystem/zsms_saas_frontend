"use client";

// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-04.
//
//   POST /auth/login  { email, password, school_slug }  credentials:'include'
//     -> 200: data.access_token, data.expires_in (seconds, 900), data.user, data.school
//     -> 401 UNAUTHORIZED / 422 VALIDATION_ERROR / 429 RATE_LIMITED (Retry-After header)
//
//   POST /auth/refresh  {}  credentials:'include'  (refresh token is an
//   httpOnly cookie the backend set on login — never touched from the frontend)
//     -> 200: new data.access_token, data.expires_in. Cookie rotates automatically.
//     -> 401/422: session dead.
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
import { getAccessToken, setAccessToken, registerAuthBridge } from "./authBridge";

export type AuthUser = Record<string, unknown> & { id?: string; email?: string };
export type AuthSchool = Record<string, unknown> & { id?: string; slug?: string };

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

  const restoreSession = useCallback(async (): Promise<boolean> => {
    setStatus("restoring");
    const result = await refresh();
    if (!result) {
      clearLocalAuth();
      return false;
    }
    // TODO(auth-me): /auth/refresh only returns a token, not user/school, so
    // a reload restores the session (route protection still works — status
    // goes "authenticated") but leaves user/school null until the next real
    // login. Once Muntajir adds a /auth/me endpoint (or refresh starts
    // returning user/school), fetch it here and setUser(...)/setSchool(...)
    // before flipping status — this is the one place that needs the change.
    setStatus("authenticated");
    return true;
  }, [refresh, clearLocalAuth]);

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

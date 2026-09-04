// Authenticated fetch wrapper. Attaches the in-memory access token and
// retries once on 401 via a single deduped /auth/refresh call.
//
// Refresh-on-401 strategy (reactive only, no proactive pre-expiry timer —
// simplest correct baseline for v1; revisit if idle-tab expiry proves
// annoying in testing):
//   1. A 401 on /auth/refresh itself never retries — refresh failing means
//      the session is dead.
//   2. A 401 on any other request triggers at most one in-flight refresh;
//      concurrent 401s share that same promise instead of each starting
//      their own.
//   3. Refresh succeeds -> retry the original request once with the new
//      token. If that retry also 401s, give up (no infinite loop).
//   4. Refresh fails -> clear auth state and redirect to /login.
import { API_BASE } from "./config";
import { getAccessToken, callRefresh, callForceLogout } from "@/lib/auth/authBridge";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

function normalizePath(path: string): string {
  return path.replace(/^\/+/, "");
}

function isRefreshEndpoint(path: string): boolean {
  return normalizePath(path) === "auth/refresh";
}

async function requestOnce(path: string, options: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_BASE}/${normalizePath(path)}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

function redirectToLogin(): void {
  if (typeof window !== "undefined") {
    window.location.assign("/login");
  }
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const response = await requestOnce(path, options, getAccessToken());

  if (response.status !== 401 || isRefreshEndpoint(path)) {
    return response;
  }

  if (!refreshInFlight) {
    refreshInFlight = callRefresh()
      .then((result) => result?.accessToken ?? null)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  const newToken = await refreshInFlight;

  if (!newToken) {
    callForceLogout();
    redirectToLogin();
    return response;
  }

  return requestOnce(path, options, newToken);
}

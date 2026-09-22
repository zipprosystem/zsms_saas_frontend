// Browser-only module-level bridge between the API client (src/lib/api/client.ts)
// and AuthProvider. Lets the fetch wrapper read the current access token and
// trigger a refresh/forced-logout without importing React or creating a
// circular import with AuthProvider itself.
//
// Safe as module state ONLY because this is imported exclusively from client
// components/hooks (never from a server component) — it never runs during
// SSR, so there's no risk of leaking one user's token into another request.

// DEV-ONLY auth bypass flag — double-gated on NODE_ENV==="development" AND
// NEXT_PUBLIC_DEV_AUTH_BYPASS==="true". MUST NEVER activate in production.
// Both env vars are inlined at build time, so in a production build
// NODE_ENV is the literal string "production" and this whole expression is
// statically false / dead-code-eliminated. Lives here (not in
// AuthProvider.tsx, which originally defined it) so any authenticated
// fetch helper — not just AuthProvider — can check it without importing
// React. See settingsApi.ts for why this matters: the bypass seeds a mock
// token that must never actually reach a real backend.
export const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true";

export type RefreshResult = { accessToken: string } | null;

let accessToken: string | null = null;
let refreshHandler: (() => Promise<RefreshResult>) | null = null;
let forceLogoutHandler: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function registerAuthBridge(handlers: {
  refresh: () => Promise<RefreshResult>;
  forceLogout: () => void;
}): void {
  refreshHandler = handlers.refresh;
  forceLogoutHandler = handlers.forceLogout;
}

export function callRefresh(): Promise<RefreshResult> {
  if (!refreshHandler) return Promise.resolve(null);
  return refreshHandler();
}

export function callForceLogout(): void {
  forceLogoutHandler?.();
}

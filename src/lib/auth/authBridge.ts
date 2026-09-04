// Browser-only module-level bridge between the API client (src/lib/api/client.ts)
// and AuthProvider. Lets the fetch wrapper read the current access token and
// trigger a refresh/forced-logout without importing React or creating a
// circular import with AuthProvider itself.
//
// Safe as module state ONLY because this is imported exclusively from client
// components/hooks (never from a server component) — it never runs during
// SSR, so there's no risk of leaking one user's token into another request.

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

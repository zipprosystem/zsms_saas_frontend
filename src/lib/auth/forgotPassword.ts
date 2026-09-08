// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-08.
//
//   POST {API_BASE}/auth/forgot-password
//   Request body: { email, school_slug }
//
//   Response is a generic HTTP 200 ALWAYS — it never reveals whether the
//   account exists. Callers MUST show the same success copy for every 2xx
//   response, with zero branching on the response body. Do not add an
//   "account not found" case here or anywhere upstream of it.
//
//   Errors:
//     HTTP 429                          -> rate limited (Retry-After header, seconds)
//     network failure / any other status -> generic error
import { API_BASE } from "@/lib/api/config";

export type ForgotPasswordResult =
  | { ok: true }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds?: number }
  | { ok: false; reason: "network_error" }
  | { ok: false; reason: "unknown_error" };

function readRetryAfterSeconds(response: Response): number | undefined {
  const header = response.headers.get("Retry-After");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export async function forgotPassword(email: string, schoolSlug: string): Promise<ForgotPasswordResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, school_slug: schoolSlug }),
    });
  } catch {
    return { ok: false, reason: "network_error" };
  }

  // Generic-200-always: any 2xx is "request submitted", full stop. Never
  // inspect the body to decide whether the account exists.
  if (response.ok) {
    return { ok: true };
  }

  if (response.status === 429) {
    return { ok: false, reason: "rate_limited", retryAfterSeconds: readRetryAfterSeconds(response) };
  }

  return { ok: false, reason: "unknown_error" };
}

import { ONBOARDING_API_BASE } from "@/lib/api/config";
import type { OnboardingContractPayload } from "./types";

/**
 * Muntajir's Public Onboarding API Contract — the ONLY two endpoints the
 * public onboarding form may call. No auth, application/json. Never call
 * provisioning, manager approve/decline, or any S2S endpoint from here.
 *
 * These endpoints live on School Manager's API (ONBOARDING_API_BASE), NOT
 * the SaaS API (API_BASE) that the rest of this app uses — different host,
 * different service. Do not switch this file back to API_BASE.
 */

export type SlugAvailability = {
  available: boolean;
  valid: boolean;
  reason: string | null;
};

// Soft UX check only — bounded so a hung/blocked request (e.g. CORS
// preflight that never resolves, dead network) can't leave the caller
// waiting forever. Real enforcement is on submit (409), which has no
// such time pressure.
const SLUG_CHECK_TIMEOUT_MS = 6000;

// GET {API_BASE}/public/onboarding/slug-availability?slug=... — soft UX
// check only. Real enforcement is on submit (409). Throws on network/
// timeout/non-2xx failure so the caller (SubdomainField) can fall back to
// "unknown" rather than showing a wrong available/taken state.
export async function checkSlugAvailability(slug: string): Promise<SlugAvailability> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLUG_CHECK_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(
      `${ONBOARDING_API_BASE}/public/onboarding/slug-availability?slug=${encodeURIComponent(slug)}`,
      { headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`slug-availability check failed: ${response.status}`);
  }

  const body = await response.json();
  return {
    available: !!body.available,
    valid: body.valid !== false,
    reason: typeof body.reason === "string" ? body.reason : null,
  };
}

export type OnboardingSubmitResult =
  | { ok: true; requestReference: string }
  | { ok: false; kind: "field"; errors: Array<{ field: string; message?: string }> }
  | { ok: false; kind: "slugTaken" }
  | { ok: false; kind: "badRequest" }
  | { ok: false; kind: "rateLimited" }
  | { ok: false; kind: "server" };

// POST {API_BASE}/public/onboarding — 201 on success with
// { request_reference, status: "pending" }. This is a pending review
// enquiry, not a live tenant: never derive a login/portal URL from the
// result.
export async function submitOnboarding(
  payload: OnboardingContractPayload,
): Promise<OnboardingSubmitResult> {
  let response: Response;
  try {
    response = await fetch(`${ONBOARDING_API_BASE}/public/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, kind: "server" };
  }

  if (response.status === 201) {
    const body = await response.json().catch(() => null);
    if (typeof body?.request_reference === "string") {
      return { ok: true, requestReference: body.request_reference };
    }
    return { ok: false, kind: "server" };
  }

  if (response.status === 422) {
    const body = await response.json().catch(() => null);
    const errors = Array.isArray(body?.errors) ? body.errors : [];
    return { ok: false, kind: "field", errors };
  }

  if (response.status === 409) return { ok: false, kind: "slugTaken" };
  if (response.status === 400) return { ok: false, kind: "badRequest" };
  if (response.status === 429) return { ok: false, kind: "rateLimited" };
  return { ok: false, kind: "server" };
}

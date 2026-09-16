import type { Tenant } from "@/types/tenant";
import { API_BASE } from "@/lib/api/config";

// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-16.
// GET {API_BASE}/tenants/by-slug/:slug — the SaaS backend registry, NOT
// School Manager. No auth header required (public tenant-resolution
// endpoint).
//
//   200 { success: true, data: { slug, name, status: "active" } }
//     -> valid tenant.
//   404 { success: false, error: { code: "TENANT_NOT_FOUND", ... } }
//     -> unknown, inactive, suspended, deactivated, AND pending tenants all
//        collapse to this single response. There is no 200-with-inactive
//        case to handle.
//
// A newly-provisioned school may stay unresolved for a window after
// creation until School Manager's S2S handoff finishes updating this
// registry — that shows up here as an ordinary 404, correctly failing
// closed until the handoff completes.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MIN_LENGTH = 2;
const SLUG_MAX_LENGTH = 100;
const VALIDATION_TIMEOUT_MS = 5000;

export type TenantValidationResult = { ok: true; tenant: Tenant } | { ok: false };

export function normalizeSlug(rawSlug: string): string | null {
  const slug = rawSlug.trim().toLowerCase();
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) return null;
  return SLUG_PATTERN.test(slug) ? slug : null;
}

/**
 * Authoritative tenant validation — fails closed on every non-success case:
 * malformed slug, 404, any other non-2xx status, a response body that
 * doesn't match the expected shape, timeout, or network error. There is no
 * mock/demo fallback anywhere in this path, dev or prod.
 */
export async function validateTenantBySlug(rawSlug: string): Promise<TenantValidationResult> {
  const slug = normalizeSlug(rawSlug);
  if (!slug) return { ok: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/tenants/by-slug/${encodeURIComponent(slug)}`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) return { ok: false };

    const body = await response.json().catch(() => null);
    const data = body?.success === true ? body.data : null;
    if (typeof data?.slug !== "string" || typeof data?.name !== "string" || data?.status !== "active") {
      return { ok: false };
    }

    return { ok: true, tenant: { slug: data.slug, name: data.name, status: "active" } };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

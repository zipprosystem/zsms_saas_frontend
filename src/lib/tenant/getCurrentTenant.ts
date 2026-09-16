import { headers } from "next/headers";
import type { Tenant } from "@/types/tenant";

/**
 * Reads the tenant headers attached by src/middleware.ts after successful
 * backend validation. Server components / server actions only (relies on
 * next/headers). Returns null for anything unresolved — there is no
 * unvalidated fallback.
 */
export function getCurrentTenant(): Tenant | null {
  const h = headers();
  const slug = h.get("x-tenant-slug");
  const name = h.get("x-tenant-name");
  const status = h.get("x-tenant-status");

  if (!slug || !name || status !== "active") {
    return null;
  }

  return { slug, name, status };
}

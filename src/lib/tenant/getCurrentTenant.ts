import { headers } from "next/headers";
import type { Tenant } from "@/types/tenant";

/**
 * Reads the tenant headers attached by src/middleware.ts. Server components /
 * server actions only (relies on next/headers).
 */
export function getCurrentTenant(): Tenant | null {
  const h = headers();
  const id = h.get("x-tenant-id");
  const slug = h.get("x-tenant-slug");
  const name = h.get("x-tenant-name");
  const status = h.get("x-tenant-status");

  if (!id || !slug || !name || !status || status === "unresolved") {
    return null;
  }

  return { id, slug, name, status: status as Tenant["status"] };
}

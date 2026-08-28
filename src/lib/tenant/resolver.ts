import type { Tenant } from "@/types/tenant";

// MOCK — hardcoded demo tenants for local dev, before the real SaaS backend
// resolve-tenant-by-slug endpoint exists. When it's ready, swap the body of
// resolveTenant() for:
//   GET https://api.zsmsapp.com/api/v1/tenants/by-slug/:slug
// keeping the same (slug: string) => Promise<Tenant | null> signature so
// nothing calling resolveTenant() needs to change.
const MOCK_TENANTS: Record<string, Tenant> = {
  "demo-school": { id: "t_demo", slug: "demo-school", name: "Demo School", status: "active" },
  "springfield-high": {
    id: "t_springfield",
    slug: "springfield-high",
    name: "Springfield High",
    status: "active",
  },
  "suspended-academy": {
    id: "t_suspended",
    slug: "suspended-academy",
    name: "Suspended Academy",
    status: "suspended",
  },
};

export async function resolveTenant(slug: string): Promise<Tenant | null> {
  return MOCK_TENANTS[slug] ?? null;
}

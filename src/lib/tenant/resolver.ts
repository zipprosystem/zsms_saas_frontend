// LEGACY MOCK — no longer wired into any runtime path. src/middleware.ts
// now validates every tenant candidate against the real SaaS backend
// (see src/lib/tenant/validateTenant.ts); this file is kept only as
// reference/fixture data, not imported by production or dev code.
const MOCK_TENANTS: Record<string, { slug: string; name: string; status: string }> = {
  "demo-school": { slug: "demo-school", name: "Demo School", status: "active" },
  "springfield-high": { slug: "springfield-high", name: "Springfield High", status: "active" },
  "suspended-academy": { slug: "suspended-academy", name: "Suspended Academy", status: "suspended" },
};

export async function resolveTenant(slug: string) {
  return MOCK_TENANTS[slug] ?? null;
}

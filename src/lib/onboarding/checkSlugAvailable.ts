import { mockDelay } from "./mockDelay";

// MOCK — simulates the future subdomain-availability endpoint (something
// like GET /api/v1/tenants/check-slug/:slug). Keeps the same
// (slug: string) => Promise<{ available: boolean }> signature so the
// SubdomainField component doesn't need to change when the real endpoint
// lands. Taken slugs mirror the demo tenants in lib/tenant/resolver.ts plus
// a few reserved words.
const MOCK_TAKEN_SLUGS = new Set([
  "demo-school",
  "springfield-high",
  "suspended-academy",
  "admin",
  "www",
  "app",
  "api",
  "test",
]);

export async function checkSlugAvailable(
  slug: string,
): Promise<{ available: boolean }> {
  await mockDelay(600);
  return { available: !MOCK_TAKEN_SLUGS.has(slug.toLowerCase()) };
}

const ROOT_DOMAIN = "zsmsapp.com";

/** Subdomain-based portal URL — matches the <slug>.zsmsapp.com tenancy model. */
export function buildPortalUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

// Used by School Settings (src/lib/settings/schoolSettings.ts,
// src/app/admin/settings/page.tsx) to display a school's operational
// status — unrelated to tenant-resolution validity below.
export type TenantStatus = "active" | "suspended" | "pending";

// A Tenant object only ever exists after successful validation against the
// SaaS backend registry (GET /tenants/by-slug/:slug) — status is always
// "active" because unknown/inactive/suspended/deactivated/pending slugs
// never construct one; see src/lib/tenant/validateTenant.ts.
//
// logoUrl added 2026-09-23 (Muntajir) — null means no logo configured for
// this tenant, not a failure; callers (the login page) fall back to the
// default ZSMS logo in that case.
export type Tenant = {
  slug: string;
  name: string;
  status: "active";
  logoUrl: string | null;
};

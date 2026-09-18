// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-04.
// Override locally via NEXT_PUBLIC_API_BASE in .env.local (e.g. to point at
// a local backend) — falls back to production otherwise.
// This is the SaaS API (Muntajir's zsms_saas_nodejs_backend) — everything
// except public onboarding uses this. Do NOT point onboarding at this base.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.zsmsapp.com/api/v1";

// The public onboarding endpoints are deployed on School Manager's API
// (a DIFFERENT host/service than the SaaS API above), per Muntajir. Only
// src/lib/onboarding/onboardingApi.ts may use this base. Override locally
// via NEXT_PUBLIC_ONBOARDING_API_BASE in .env.local.
export const ONBOARDING_API_BASE =
  process.env.NEXT_PUBLIC_ONBOARDING_API_BASE ?? "https://api.schoolsmanager.zipprosystem.com/api/v1";

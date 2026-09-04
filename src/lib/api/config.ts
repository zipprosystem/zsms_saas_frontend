// Verified contract from Muntajir (Chirag Technology), confirmed 2026-09-04.
// Override locally via NEXT_PUBLIC_API_BASE in .env.local (e.g. to point at
// a local backend) — falls back to production otherwise.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://api.zsmsapp.com/api/v1";

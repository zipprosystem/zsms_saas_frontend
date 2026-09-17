import { NextResponse, type NextRequest } from "next/server";
import { validateTenantBySlug } from "@/lib/tenant/validateTenant";

const ROOT_DOMAIN = "zsmsapp.com";

// The ONLY non-tenant hosts. Everything else ending in .zsmsapp.com —
// including app.zsmsapp.com — is a tenant candidate that must be validated
// against the registry, never assumed.
const RESERVED_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, `api.${ROOT_DOMAIN}`]);

// The public platform host — apex and www, per Muntajir. Gets marketing at
// "/" and the public self-onboarding form at "/onboarding", with no tenant
// validation ever. A strict subset of RESERVED_HOSTS (api.* is reserved but
// NOT public-routed — it stays a bare pass-through, unchanged).
const PUBLIC_PLATFORM_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`]);

const TENANT_HEADERS = ["x-tenant-slug", "x-tenant-name", "x-tenant-status"];

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

// Double-gated like AuthProvider's DEV_AUTH_BYPASS (hostname AND NODE_ENV)
// so a spoofed `Host: localhost` header can never activate the dev
// fallback chain against a production deployment.
function isLocalDevAllowed(hostname: string): boolean {
  return isLocalHost(hostname) && process.env.NODE_ENV !== "production";
}

// <slug>.zsmsapp.com -> "slug". Malformed/unrecognized hosts (not a
// reserved host, not a *.zsmsapp.com subdomain) return null and fail closed.
function extractCandidateSlug(hostname: string): string | null {
  if (RESERVED_HOSTS.has(hostname)) return null;
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const subdomain = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
  return subdomain.split(".")[0] || null;
}

// The tenant identity comes ONLY from the Host-derived, server-validated
// resolution below — never from the client. Strip any inbound x-tenant-*
// headers on every branch before deciding anything, so a request that
// forges them (e.g. against a reserved host) can never have them pass
// through unmodified to a page that trusts them.
function stripInboundTenantHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  for (const name of TENANT_HEADERS) headers.delete(name);
  return headers;
}

function rewriteToInvalidTenant(request: NextRequest, headers: Headers) {
  return NextResponse.rewrite(new URL("/tenant-invalid", request.url), { request: { headers } });
}

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const pathname = request.nextUrl.pathname;
  const requestHeaders = stripInboundTenantHeaders(request);

  // Apex/www: the public platform host, never a tenant. Marketing at "/",
  // public self-onboarding at "/onboarding" — no tenant validation ever
  // happens on this host, for any path.
  if (PUBLIC_PLATFORM_HOSTS.has(hostname)) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/landing", request.url), { request: { headers: requestHeaders } });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // The marketing page is always reachable directly regardless of host
  // (e.g. local dev, or reviewing it on any host) — it's static public
  // content with no tenant data, so bypassing validation here carries no
  // fail-closed risk.
  if (pathname === "/landing" || pathname.startsWith("/landing/")) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Any other reserved host (api) is never a tenant — bare pass-through,
  // exactly as before this change.
  if (RESERVED_HOSTS.has(hostname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Everything below is unchanged tenant-validation logic. Note
  // "/onboarding" is NOT special-cased here — on a tenant host it's just a
  // normal path and goes through the same validation as everything else.

  const slug = isLocalDevAllowed(hostname)
    ? request.nextUrl.searchParams.get("tenant") || process.env.DEV_TENANT_SLUG || "demo-school"
    : extractCandidateSlug(hostname);

  if (!slug) {
    return rewriteToInvalidTenant(request, requestHeaders);
  }

  const result = await validateTenantBySlug(slug);
  if (!result.ok) {
    return rewriteToInvalidTenant(request, requestHeaders);
  }

  requestHeaders.set("x-tenant-slug", result.tenant.slug);
  requestHeaders.set("x-tenant-name", result.tenant.name);
  requestHeaders.set("x-tenant-status", result.tenant.status);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

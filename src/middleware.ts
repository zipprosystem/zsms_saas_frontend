import { NextResponse, type NextRequest } from "next/server";
import { resolveTenant } from "@/lib/tenant/resolver";

const ROOT_DOMAIN = "zsmsapp.com";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".localhost");
}

// PRODUCTION: <slug>.zsmsapp.com -> "slug". Apex (zsmsapp.com) and
// www.zsmsapp.com are treated as tenant-less. Anything else unrecognized is
// also tenant-less.
function extractSlugFromProdHost(hostname: string): string | null {
  if (hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`) {
    return null;
  }
  if (hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    const subdomain = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
    return subdomain.split(".")[0] || null;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const hostname = (request.headers.get("host") ?? "").split(":")[0];
  const pathname = request.nextUrl.pathname;

  // Public self-onboarding: no tenant exists yet (the school is being
  // created), so skip tenant resolution entirely — don't let the local-dev
  // fallback chain below attach a demo tenant here.
  const isPublicOnboarding = pathname === "/onboarding" || pathname.startsWith("/onboarding/");

  // LOCAL DEV fallback chain (Option 3): ?tenant= param -> DEV_TENANT_SLUG -> hardcoded default.
  const slug = isPublicOnboarding
    ? null
    : isLocalHost(hostname)
      ? request.nextUrl.searchParams.get("tenant") || process.env.DEV_TENANT_SLUG || "demo-school"
      : extractSlugFromProdHost(hostname);

  const requestHeaders = new Headers(request.headers);

  if (slug) {
    const tenant = await resolveTenant(slug);
    if (tenant) {
      requestHeaders.set("x-tenant-id", tenant.id);
      requestHeaders.set("x-tenant-slug", tenant.slug);
      requestHeaders.set("x-tenant-name", tenant.name);
      requestHeaders.set("x-tenant-status", tenant.status);
    } else {
      // Unknown slug: mock phase, so we don't hard-block. Flag it as
      // unresolved and let the request through; tenant-not-found UX is a
      // later phase decision.
      requestHeaders.set("x-tenant-slug", slug);
      requestHeaders.set("x-tenant-status", "unresolved");
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

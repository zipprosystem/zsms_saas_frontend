import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  // Middleware already blocks unresolved tenants before this page is
  // reached; this is defense in depth so LoginForm can never render for a
  // tenant that didn't pass validation. Same fixed, non-reflected
  // destination as the middleware's invalid-tenant redirect — see
  // src/middleware.ts's INVALID_TENANT_REDIRECT_URL.
  const tenant = getCurrentTenant();
  if (!tenant) {
    redirect("https://zsmsapp.com");
  }

  return <LoginForm schoolSlug={tenant.slug} schoolName={tenant.name} logoUrl={tenant.logoUrl} />;
}

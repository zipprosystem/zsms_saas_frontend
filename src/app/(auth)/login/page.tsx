import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  // Middleware already blocks unresolved tenants before this page is
  // reached; this is defense in depth so LoginForm can never render for a
  // tenant that didn't pass validation.
  const tenant = getCurrentTenant();
  if (!tenant) {
    redirect("/tenant-invalid");
  }

  return <LoginForm schoolSlug={tenant.slug} />;
}

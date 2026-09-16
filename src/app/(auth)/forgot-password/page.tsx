import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  // Middleware already blocks unresolved tenants before this page is
  // reached; this is defense in depth, same reasoning as login/page.tsx.
  const tenant = getCurrentTenant();
  if (!tenant) {
    redirect("/tenant-invalid");
  }

  return <ForgotPasswordForm schoolSlug={tenant.slug} />;
}

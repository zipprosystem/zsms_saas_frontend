import { headers } from "next/headers";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  // Raw header value (not getCurrentTenant()) — same reasoning as
  // login/page.tsx: we only need the slug string to send to the backend,
  // regardless of whether the tenant resolved locally.
  const schoolSlug = headers().get("x-tenant-slug") ?? "";

  return <ForgotPasswordForm schoolSlug={schoolSlug} />;
}

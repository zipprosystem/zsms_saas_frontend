import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  // Raw header value (not getCurrentTenant()) — login only needs the slug
  // string to send to the backend, regardless of whether the tenant
  // resolved locally; the backend is the source of truth on validity.
  const schoolSlug = headers().get("x-tenant-slug") ?? "";

  return <LoginForm schoolSlug={schoolSlug} />;
}

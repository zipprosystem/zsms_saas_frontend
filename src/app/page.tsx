import { redirect } from "next/navigation";

/**
 * Panel router. Each tenant has an admin panel (this repo, live) plus
 * future student and parent panels under /student and /parent. Once
 * auth exists, this becomes a role-based router: resolve the signed-in
 * user's role and redirect to /admin, /student, or /parent accordingly.
 * Only the admin panel exists today, so it's a single redirect for now.
 */
export default function Home() {
  redirect("/admin/overview");
}

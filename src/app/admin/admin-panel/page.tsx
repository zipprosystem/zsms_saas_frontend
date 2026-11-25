import { redirect } from "next/navigation";

/** Admin Panel has no landing page of its own yet — Parents is its first (and only) built entry. */
export default function Page() {
  redirect("/admin/admin-panel/parents");
}

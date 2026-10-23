import { redirect } from "next/navigation";

/** Academics has no landing page of its own yet — Exam is its only built area. */
export default function Page() {
  redirect("/admin/academics/exam");
}

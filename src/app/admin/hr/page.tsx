import { redirect } from "next/navigation";

/** HR has no landing page of its own — Staff is its home. */
export default function Page() {
  redirect("/admin/hr/staffs");
}

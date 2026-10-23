import { redirect } from "next/navigation";

/** Results (Manage Exam Result) is the only built Exam tab so far. */
export default function Page() {
  redirect("/admin/academics/exam/results");
}

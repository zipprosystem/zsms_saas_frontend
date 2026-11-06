import { Suspense } from "react";
import { StudentEntryScreen } from "@/components/exam/reportProgression/StudentEntryScreen";

type PageProps = { params: Promise<{ classId: string; studentId: string }> };

/** Report Progression › View Details — the student-wise entry (Stage 2). */
export default async function Page({ params }: PageProps) {
  const { classId, studentId } = await params;
  return (
    <Suspense fallback={null}>
      <StudentEntryScreen classId={decodeURIComponent(classId)} studentId={decodeURIComponent(studentId)} />
    </Suspense>
  );
}

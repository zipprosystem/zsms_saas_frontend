import { Suspense } from "react";
import { ClassProgressionScreen } from "@/components/exam/reportProgression/ClassProgressionScreen";

type PageProps = { params: Promise<{ classId: string }> };

/** Report Progression › one class's students. */
export default async function Page({ params }: PageProps) {
  const { classId } = await params;
  return (
    <Suspense fallback={null}>
      <ClassProgressionScreen classId={decodeURIComponent(classId)} />
    </Suspense>
  );
}

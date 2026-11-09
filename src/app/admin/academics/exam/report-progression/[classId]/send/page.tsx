import { Suspense } from "react";
import { SendToParentScreen } from "@/components/exam/reportProgression/SendToParentScreen";
import { isProgressionPoint } from "@/lib/exam/reportProgression/reportProgressionApi";

type PageProps = { params: Promise<{ classId: string }>; searchParams: Promise<{ term?: string; point?: string }> };

/** Report Progression › Send Result to Parent (Stage 4). */
export default async function Page({ params, searchParams }: PageProps) {
  const { classId } = await params;
  const { term, point } = await searchParams;
  return (
    <Suspense fallback={null}>
      <SendToParentScreen classId={decodeURIComponent(classId)} term={term ?? ""} point={isProgressionPoint(point) ? point : "ca"} />
    </Suspense>
  );
}

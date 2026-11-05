import { Suspense } from "react";
import { ReportProgressionScreen } from "@/components/exam/reportProgression/ReportProgressionScreen";

/** Exam › Report Progression — overrides the [tab] placeholder route. useSearchParams needs a Suspense boundary. */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportProgressionScreen />
    </Suspense>
  );
}

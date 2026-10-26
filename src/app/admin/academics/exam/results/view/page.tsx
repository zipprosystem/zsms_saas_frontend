import { Suspense } from "react";
import { ResultsScreen } from "@/components/exam/results/ResultsScreen";

// useSearchParams (the ?tab= sub-tab) needs a Suspense boundary.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResultsScreen />
    </Suspense>
  );
}

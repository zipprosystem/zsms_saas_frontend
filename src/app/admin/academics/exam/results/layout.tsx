import type { ReactNode } from "react";
import { ResultsSubTabs } from "@/components/exam/ResultsSubTabs";

export default function ResultsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <ResultsSubTabs />
      {children}
    </div>
  );
}

import type { ReactNode } from "react";
import { ExamHeader } from "@/components/exam/ExamHeader";
import { ExamTabs } from "@/components/exam/ExamTabs";

export default function ExamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ExamHeader />
      <ExamTabs />
      {children}
    </div>
  );
}

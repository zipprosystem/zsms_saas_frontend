import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGate } from "@/components/auth/AuthGate";
import { AcademicYearProvider } from "@/lib/academicYear/AcademicYearContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      {/* Inside AuthGate, not outside — AuthGate only renders children once
          truly authenticated, so this can fetch on mount unconditionally
          rather than re-checking auth status itself. */}
      <AcademicYearProvider>
        <AppShell>{children}</AppShell>
      </AcademicYearProvider>
    </AuthGate>
  );
}

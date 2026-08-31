import Image from "next/image";
import type { ReactNode } from "react";
import { OnboardingBackground } from "@/components/onboarding/OnboardingBackground";
import { OnboardingHeaderControls } from "@/components/onboarding/OnboardingHeaderControls";

/**
 * Minimal public layout for the self-onboarding flow: brand only, no
 * dashboard chrome (no sidebar/header/AppShell) — there's no tenant or
 * signed-in user here yet.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh bg-background">
      <OnboardingBackground />
      <header className="relative z-10 flex items-center justify-between gap-2.5 px-6 py-6 lg:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white p-1.5 shadow-[2px_4px_8px_rgba(0,0,0,0.1)]">
            <Image
              src="/auth/zsms-logo.png"
              alt="ZSMS"
              width={24}
              height={24}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="text-base font-semibold text-text-primary">ZSMS</p>
        </div>
        <OnboardingHeaderControls />
      </header>
      <main className="relative z-10">{children}</main>
    </div>
  );
}

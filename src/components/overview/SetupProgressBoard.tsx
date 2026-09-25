"use client";

import { useSetupProgress } from "@/lib/setup/setupProgress";
import { OverallProgressCard } from "./OverallProgressCard";
import { SetupCategoriesSection } from "./SetupCategoriesSection";

/**
 * Owns the single useSetupProgress() fetch and hands the same result to
 * both children — neither one fetches its own copy, so switching the
 * session-picker year (which the hook itself re-checks against) only ever
 * triggers one round of existence checks, not two.
 */
export function SetupProgressBoard() {
  const progress = useSetupProgress();

  return (
    <>
      <OverallProgressCard progress={progress} />
      <SetupCategoriesSection progress={progress} />
    </>
  );
}

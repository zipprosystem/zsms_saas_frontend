import { mockDelay } from "./mockDelay";
import { checkSlugAvailable } from "./checkSlugAvailable";
import { buildPortalUrl } from "./portalUrl";
import type { OnboardingSubmissionPayload } from "./types";

export type SubmitOnboardingResult =
  | { ok: true; portalUrl: string }
  | { ok: false; error: { field?: string; messageKey: string } };

// MOCK — simulates the future school-provisioning endpoint. Swap the body
// for a real POST to the SaaS backend once it exists, keeping this
// (payload) => Promise<SubmitOnboardingResult> signature so
// OnboardingWizard doesn't need to change. Re-checks slug availability at
// submit time (a real backend would do the same, to catch a race between
// the live check and submission).
export async function submitOnboarding(
  payload: OnboardingSubmissionPayload,
): Promise<SubmitOnboardingResult> {
  await mockDelay(1200);

  const availability = await checkSlugAvailable(payload.school.slug);
  if (!availability.available) {
    return {
      ok: false,
      error: { field: "school.slug", messageKey: "onboarding.errors.slugTaken" },
    };
  }

  return { ok: true, portalUrl: buildPortalUrl(payload.school.slug) };
}

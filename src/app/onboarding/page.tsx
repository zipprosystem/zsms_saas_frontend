import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

export default function Page() {
  // Defense in depth: middleware only skips tenant validation for
  // "/onboarding" on the public platform host (apex/www); on a validated
  // tenant host this path still resolves here since it's a normal route.
  // If a tenant resolved, we're not on the public host — send them to
  // their portal instead of showing the public self-onboarding form.
  const tenant = getCurrentTenant();
  if (tenant) {
    redirect("/login");
  }

  return <OnboardingWizard />;
}

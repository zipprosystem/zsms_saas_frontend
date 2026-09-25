import { getTranslations } from "next-intl/server";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";
import { SetupHeader } from "@/components/overview/SetupHeader";
import { SetupProgressBoard } from "@/components/overview/SetupProgressBoard";

// Moved here from /admin/overview verbatim — Overview is now a placeholder
// for the future real dashboard, and this ("Complete Your School Setup")
// is the Setup area's landing page.
export default async function Page() {
  const tenant = getCurrentTenant();
  const t = await getTranslations();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {tenant && (
        <p className="pb-6 text-sm text-text-secondary">
          {t("tenant.label")}: <span className="font-semibold text-text-primary">{tenant.name}</span>
        </p>
      )}
      <div className="flex min-w-0 flex-col gap-6">
        <SetupHeader />
        <SetupProgressBoard />
      </div>
    </div>
  );
}

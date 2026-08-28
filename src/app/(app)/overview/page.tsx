import { getTranslations } from "next-intl/server";
import { ModuleStub } from "@/components/layout/ModuleStub";
import { getCurrentTenant } from "@/lib/tenant/getCurrentTenant";

export default async function Page() {
  const tenant = getCurrentTenant();
  const t = await getTranslations();

  return (
    <div className="flex flex-1 flex-col">
      {tenant && (
        <p className="px-8 pt-6 text-sm text-text-secondary">
          {t("tenant.label")}: <span className="font-semibold text-text-primary">{tenant.name}</span>
        </p>
      )}
      <ModuleStub titleKey="nav.overview" />
    </div>
  );
}

import { getTranslations } from "next-intl/server";

// The "Complete Your School Setup" checklist that used to live here has
// moved to /admin/setup — this becomes the real dashboard later.
export default async function Page() {
  const t = await getTranslations();

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-text-muted">{t("overview.dashboardComingSoon")}</p>
    </div>
  );
}

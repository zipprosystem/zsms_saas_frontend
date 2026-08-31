import { getTranslations } from "next-intl/server";

/**
 * Reserved namespace for the future student panel (<slug>.zsmsapp.com/student/*).
 * Not designed or built yet — see the panel-router comment in src/app/page.tsx.
 * Intentionally has no shared layout: the student panel will get its own
 * shell once designed, not the admin panel's AppShell.
 */
export default async function Page() {
  const t = await getTranslations();

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-8">
      <p className="text-lg font-medium text-text-primary">
        {t("panels.student.title")} — {t("common.comingSoon")}
      </p>
    </div>
  );
}

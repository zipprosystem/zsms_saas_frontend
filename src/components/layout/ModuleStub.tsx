import { getTranslations } from "next-intl/server";

export async function ModuleStub({ titleKey }: { titleKey: string }) {
  const t = await getTranslations();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-lg font-medium text-text-primary">
        {t(titleKey)} — {t("common.comingSoon")}
      </p>
    </div>
  );
}

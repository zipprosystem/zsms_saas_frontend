"use client";

import { useTranslations } from "next-intl";
import { TemplateCatalogScreen } from "@/components/setup/assessmentConfiguration/TemplateCatalogScreen";
import { resultTemplatesService } from "@/lib/setup/assessmentConfiguration/resultTemplatesApi";

export function ResultTemplatesScreen() {
  const t = useTranslations();

  return (
    <TemplateCatalogScreen
      title={t("setup.resultTemplates.title")}
      subtitle={t("setup.resultTemplates.subtitle")}
      service={resultTemplatesService}
      searchPlaceholder={t("setup.resultTemplates.searchPlaceholder")}
      emptyMessage={t("setup.resultTemplates.empty")}
      // Wide enough for the British report's landscape grid.
      previewVirtualWidth={1200}
    />
  );
}

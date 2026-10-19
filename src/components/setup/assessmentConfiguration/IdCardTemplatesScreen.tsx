"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TemplateCatalogScreen } from "@/components/setup/assessmentConfiguration/TemplateCatalogScreen";
import {
  ID_CARD_KINDS,
  idCardTemplatesServices,
  type IdCardKind,
} from "@/lib/setup/assessmentConfiguration/idCardTemplatesApi";

/** Student / Staff tabs, each its own ?kind= list with its own default. */
export function IdCardTemplatesScreen() {
  const t = useTranslations();
  const [kind, setKind] = useState<IdCardKind>("student");

  return (
    <TemplateCatalogScreen
      // Remount per tab so search/paging never carry over between kinds.
      key={kind}
      title={t("setup.idCardTemplates.title")}
      subtitle={t("setup.idCardTemplates.subtitle")}
      service={idCardTemplatesServices[kind]}
      searchPlaceholder={t("setup.idCardTemplates.searchPlaceholder")}
      emptyMessage={t(`setup.idCardTemplates.empty.${kind}`)}
      previewFocus={kind}
      previewVirtualWidth={1000}
      tabs={
        <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
          {ID_CARD_KINDS.map((tabKind) => {
            const isActive = tabKind === kind;
            return (
              <button
                key={tabKind}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setKind(tabKind)}
                className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text-primary"
                }`}
              >
                {t(`setup.idCardTemplates.tabs.${tabKind}`)}
              </button>
            );
          })}
        </div>
      }
    />
  );
}

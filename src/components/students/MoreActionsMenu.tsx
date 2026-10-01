"use client";

import { useTranslations } from "next-intl";
import { ChevronDownIcon } from "@/components/icons/sidebar/ChevronDownIcon";
import { ActionsMenu } from "@/components/ui/ActionsMenu";

/** Bulk-actions menu beside Export List / Add New Student — every item is "coming in the next update" for now (Commit 1); none are dead ends, each gives clear feedback. */
export function MoreActionsMenu({ onComingSoon }: { onComingSoon: () => void }) {
  const t = useTranslations();

  return (
    <ActionsMenu
      triggerClassName="w-full sm:w-auto"
      menuLabel={t("students.more.label")}
      items={[
        { key: "import", label: t("students.more.importStudent"), onClick: onComingSoon },
        { key: "exportPassports", label: t("students.more.exportPassports"), onClick: onComingSoon },
        { key: "bulkUpload", label: t("students.more.bulkUpload"), onClick: onComingSoon },
        { key: "bulkGraduation", label: t("students.more.bulkGraduation"), onClick: onComingSoon },
        { key: "bulkActivateDeactivate", label: t("students.more.bulkActivateDeactivate"), onClick: onComingSoon },
      ]}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-background focus:outline-none focus:ring-2 focus:ring-accent sm:w-auto"
        >
          {t("students.more.label")}
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      )}
    />
  );
}

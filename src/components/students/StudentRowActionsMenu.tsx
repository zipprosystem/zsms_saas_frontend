"use client";

import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import type { Student } from "@/lib/students/studentTypes";

/**
 * Per-row "⋮" menu. Every item is "coming in the next update" for now
 * (Commit 1) — View/Edit opens the wizard (Commit 2); Send Mail/Login As
 * are their own future pages; Suspend/Graduate/Expel/Withdraw are ONE
 * unified status-change flow (category + reason + date — see
 * studentTypes.ts's StudentStatus doc) landing in a later commit.
 */
export function StudentRowActionsMenu({ student, onComingSoon }: { student: Student; onComingSoon: () => void }) {
  const t = useTranslations();

  return (
    <ActionsMenu
      menuLabel={t("students.actions.menuLabel", { name: student.first_name })}
      items={[
        { key: "view", label: t("students.actions.view"), onClick: onComingSoon },
        { key: "edit", label: t("students.actions.edit"), onClick: onComingSoon },
        { key: "sendMail", label: t("students.actions.sendMail"), onClick: onComingSoon },
        { key: "loginAs", label: t("students.actions.loginAs"), onClick: onComingSoon },
        { key: "suspend", label: t("students.actions.suspend"), onClick: onComingSoon },
        { key: "graduate", label: t("students.actions.graduate"), onClick: onComingSoon },
        { key: "expel", label: t("students.actions.expel"), onClick: onComingSoon, variant: "danger" },
        { key: "withdraw", label: t("students.actions.withdraw"), onClick: onComingSoon, variant: "danger" },
      ]}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={t("students.actions.menuLabel", { name: student.first_name })}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      )}
    />
  );
}

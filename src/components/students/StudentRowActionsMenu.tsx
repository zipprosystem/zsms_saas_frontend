"use client";

import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import type { Student } from "@/lib/students/studentTypes";

/**
 * Per-row "⋮" menu. View/Edit opens the wizard; Withdraw sets the
 * student's status for real (Commit 3). Send Mail/Login As are their own
 * future pages; Suspend/Graduate/Expel still show "coming soon" — those
 * three plus Withdraw are meant to be ONE unified status-change flow
 * (category + reason + date — see studentTypes.ts's StudentStatus doc)
 * once built; Withdraw alone, without that flow, is the explicitly-scoped
 * piece for this commit.
 */
export function StudentRowActionsMenu({
  student,
  onEdit,
  onWithdraw,
  onComingSoon,
}: {
  student: Student;
  /** View and Edit both open the wizard in edit mode — there's no separate read-only view, so "View" is functionally identical to "Edit". */
  onEdit: () => void;
  onWithdraw: () => void;
  onComingSoon: () => void;
}) {
  const t = useTranslations();

  return (
    <ActionsMenu
      menuLabel={t("students.actions.menuLabel", { name: student.first_name })}
      items={[
        { key: "view", label: t("students.actions.view"), onClick: onEdit },
        { key: "edit", label: t("students.actions.edit"), onClick: onEdit },
        { key: "sendMail", label: t("students.actions.sendMail"), onClick: onComingSoon },
        { key: "loginAs", label: t("students.actions.loginAs"), onClick: onComingSoon },
        { key: "suspend", label: t("students.actions.suspend"), onClick: onComingSoon },
        { key: "graduate", label: t("students.actions.graduate"), onClick: onComingSoon },
        { key: "expel", label: t("students.actions.expel"), onClick: onComingSoon, variant: "danger" },
        { key: "withdraw", label: t("students.actions.withdraw"), onClick: onWithdraw, variant: "danger" },
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

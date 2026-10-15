"use client";

import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui/ActionsMenu";
import { isWithdrawnGroup } from "@/lib/students/studentsTableHelpers";
import type { StudentStatusPanelAction } from "@/components/students/StudentStatusActionPanel";
import type { Student } from "@/lib/students/studentTypes";

/**
 * Per-row "⋮" menu — the items depend on the student's status:
 *   active:                         View, Edit, Send Mail*, Login as Student*, Graduate, Withdraw
 *   withdrawn/suspended/expelled:   View, Reactivate
 *   graduated:                      View, Restore
 * (* coming soon.) Suspend/Expel are NOT menu items — they're categories
 * inside the one Withdraw form (StudentStatusActionPanel). Drafts never
 * reach this menu (Resume/Delete replace it — see StudentsScreen.tsx).
 */
export function StudentRowActionsMenu({
  student,
  onView,
  onEdit,
  onStatusAction,
  onComingSoon,
}: {
  student: Student;
  onView: () => void;
  onEdit: () => void;
  onStatusAction: (action: StudentStatusPanelAction) => void;
  onComingSoon: () => void;
}) {
  const t = useTranslations();

  const view: ActionsMenuItem = { key: "view", label: t("students.actions.view"), onClick: onView };
  let items: ActionsMenuItem[];
  if (student.status === "active") {
    items = [
      view,
      { key: "edit", label: t("students.actions.edit"), onClick: onEdit },
      { key: "sendMail", label: t("students.actions.sendMail"), onClick: onComingSoon },
      { key: "loginAs", label: t("students.actions.loginAs"), onClick: onComingSoon },
      { key: "graduate", label: t("students.actions.graduate"), onClick: () => onStatusAction("graduate") },
      { key: "withdraw", label: t("students.actions.withdraw"), onClick: () => onStatusAction("withdraw"), variant: "danger" },
    ];
  } else if (isWithdrawnGroup(student)) {
    items = [view, { key: "reactivate", label: t("students.actions.reactivate"), onClick: () => onStatusAction("reactivate") }];
  } else if (student.status === "graduated") {
    items = [view, { key: "restore", label: t("students.actions.restore"), onClick: () => onStatusAction("restore") }];
  } else {
    items = [view];
  }

  return (
    <ActionsMenu
      menuLabel={t("students.actions.menuLabel", { name: student.first_name })}
      items={items}
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

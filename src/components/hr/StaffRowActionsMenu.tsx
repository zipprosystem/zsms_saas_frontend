"use client";

import { useTranslations } from "next-intl";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { ActionsMenu, type ActionsMenuItem } from "@/components/ui/ActionsMenu";
import { isLeaverStatus, type Staff, type StaffStatusEventType } from "@/lib/hr/hrTypes";

/**
 * Per-row "⋮" menu — items follow the staff's status (same transitions
 * the backend allows, see hrMockBackend.ts applyLeaver/applyReinstate):
 *   active:        View, Edit, Leaver
 *   suspended:     View, Edit, Leaver (into another category), Reinstate
 *   other leavers: View, Edit, Reinstate
 * Drafts never reach this menu (Resume / Delete replace it).
 */
export function StaffRowActionsMenu({
  staff,
  onView,
  onEdit,
  onStatusAction,
}: {
  staff: Staff;
  onView: () => void;
  onEdit: () => void;
  onStatusAction: (action: StaffStatusEventType) => void;
}) {
  const t = useTranslations();
  const items: ActionsMenuItem[] = [
    { key: "view", label: t("hr.staffs.actions.view"), onClick: onView },
    { key: "edit", label: t("common.edit"), onClick: onEdit },
  ];
  if (staff.status === "active" || staff.status === "suspended") {
    items.push({ key: "leaver", label: t("hr.status.leaver.menu"), onClick: () => onStatusAction("leaver"), variant: "danger" });
  }
  if (isLeaverStatus(staff.status)) {
    items.push({ key: "reinstate", label: t("hr.status.reinstate.menu"), onClick: () => onStatusAction("reinstate") });
  }

  const menuLabel = t("hr.staffs.actions.menuLabel", { name: staff.first_name || staff.last_name });
  return (
    <ActionsMenu
      menuLabel={menuLabel}
      items={items}
      trigger={({ isOpen, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-label={menuLabel}
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <MoreVerticalIcon className="h-4 w-4" />
        </button>
      )}
    />
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { TextareaField } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { resultErrorMessage } from "@/components/setup/CrudScreen";
import { applyStaffLeaver, reinstateStaff, staffFullName, staffListQueryKeyRoot } from "@/lib/hr/staffRecordsApi";
import {
  LEAVER_CATEGORY_STATUS,
  STAFF_LEAVER_CATEGORIES,
  type Staff,
  type StaffLeaverCategory,
  type StaffStatusEventType,
} from "@/lib/hr/hrTypes";

type StaffStatusDialogProps = {
  staff: Staff;
  /** "leaver" = apply a Leaver category; "reinstate" = back to active. */
  action: StaffStatusEventType;
  onClose: () => void;
  onDone: (updated: Staff) => void;
};

/**
 * The one Leaver flow (parallel to the students' Withdraw) and Reinstate,
 * in the Figma confirm-modal shell (3347:62571 / 3347:62416). Leaver: a
 * category (Retire / Terminate / Resign / Abscond / Suspend) + effective
 * date + reason, all required; the staff leaves the active roster and
 * their login is turned off. A suspended staff can move into any OTHER
 * category. Reinstate: effective date + reason; login stays off until an
 * admin re-enables it from the profile.
 */
export function StaffStatusDialog({ staff, action, onClose, onDone }: StaffStatusDialogProps) {
  const t = useTranslations();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<StaffLeaverCategory | "">("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const isLeaver = action === "leaver";
  // Mirrors the backend rule: a suspended staff can't be "suspended" again.
  const categoryOptions = STAFF_LEAVER_CATEGORIES.filter((item) => LEAVER_CATEGORY_STATUS[item] !== staff.status);
  const name = staffFullName(staff);

  const handleConfirm = async () => {
    const nextErrors: Record<string, string> = {};
    if (isLeaver && !category) nextErrors.category = t("hr.status.errors.categoryRequired");
    if (!effectiveDate) nextErrors.effective_date = t("hr.status.errors.dateRequired");
    if (!reason.trim()) nextErrors.reason = t("hr.status.errors.reasonRequired");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSaving(true);
    const result =
      isLeaver && category
        ? await applyStaffLeaver(staff.id, { category, effective_date: effectiveDate, reason: reason.trim() })
        : await reinstateStaff(staff.id, { effective_date: effectiveDate, reason: reason.trim() });
    setIsSaving(false);
    if (!result.ok) {
      if (result.kind === "validation" && result.errors.length > 0) {
        setErrors(Object.fromEntries(result.errors.map((error) => [error.field, error.message ?? t("hr.status.errors.invalid")])));
        return;
      }
      showToast(resultErrorMessage(result, t));
      return;
    }
    queryClient.invalidateQueries({ queryKey: staffListQueryKeyRoot });
    showToast(
      isLeaver && category
        ? t("hr.status.toast.leaver", { name, status: t(`hr.staffs.status.${LEAVER_CATEGORY_STATUS[category]}`) })
        : t("hr.status.toast.reinstate", { name }),
    );
    onDone(result.data);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-status-title"
        className="relative flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-surface p-6 shadow-xl"
      >
        <div>
          <h2 id="staff-status-title" className="text-base font-semibold text-text-primary">
            {t(`hr.status.${action}.title`)}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{t(`hr.status.${action}.message`, { name })}</p>
        </div>

        {isLeaver ? (
          <SelectField
            id="staff-leaver-category"
            label={t("hr.status.category.label")}
            value={category}
            onChange={(event) => setCategory(categoryOptions.find((item) => item === event.target.value) ?? "")}
            hasError={!!errors.category}
            error={errors.category}
          >
            <option value="" disabled>
              {t("hr.status.category.placeholder")}
            </option>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>
                {t(`hr.status.category.${item}`)}
              </option>
            ))}
          </SelectField>
        ) : null}
        <InputField
          id="staff-status-date"
          type="date"
          label={t(isLeaver && category ? `hr.status.dateLabel.${category}` : "hr.status.dateLabel.default")}
          value={effectiveDate}
          onChange={(event) => setEffectiveDate(event.target.value)}
          hasError={!!errors.effective_date}
          error={errors.effective_date}
        />
        <TextareaField
          id="staff-status-reason"
          label={t("hr.status.reason.label")}
          placeholder={t("hr.status.reason.placeholder")}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          hasError={!!errors.reason}
          error={errors.reason}
        />

        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} className="h-10 px-4 text-sm">
            {t("hr.status.goBack")}
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSaving}
            className={`h-10 px-4 text-sm ${isLeaver ? "bg-error hover:bg-error/90" : ""}`}
          >
            {isSaving ? t("common.saving") : t(`hr.status.${action}.confirm`)}
          </Button>
        </div>
      </div>
    </div>
  );
}

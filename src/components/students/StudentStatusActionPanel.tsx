"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { changeStudentStatus } from "@/lib/students/studentsApi";
import { studentFullName } from "@/lib/students/studentsTableHelpers";
import type { CrudResult } from "@/lib/setup/crudTypes";
import type { Student } from "@/lib/students/studentTypes";

/**
 * The four admin-facing status flows. "withdraw" is the unified
 * Withdraw-category form: Withdrawn / Suspended / Expelled are categories
 * INSIDE it (each its own backend route), not separate menu items.
 */
export type StudentStatusPanelAction = "withdraw" | "graduate" | "reactivate" | "restore";

type WithdrawCategory = "withdrawn" | "suspended" | "expelled";

const REASON_MAX_LENGTH = 500;

/** Success-toast key suffix under students.statusActions.success.* */
type SuccessKey = WithdrawCategory | "reactivated" | "graduated" | "restored";

/**
 * Reason rules, exactly per the backend's validation:
 *   withdraw (Withdrawn) optional · suspend/expel REQUIRED · reactivate
 *   REQUIRED · restore optional · graduate has NO reason (rejected if sent).
 */
function isReasonRequired(action: StudentStatusPanelAction, category: WithdrawCategory): boolean {
  return action === "reactivate" || (action === "withdraw" && category !== "withdrawn");
}

export function StudentStatusActionPanel({
  student,
  action,
  onClose,
  onDone,
}: {
  student: Student;
  action: StudentStatusPanelAction;
  onClose: () => void;
  /** Called after a successful change with the toast to show — the caller refetches/invalidates. */
  onDone: (message: string) => void;
}) {
  const t = useTranslations();
  const [category, setCategory] = useState<WithdrawCategory>("withdrawn");
  const [reason, setReason] = useState("");
  const [effectiveOn, setEffectiveOn] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const name = studentFullName(student) || "—";
  const showReason = action !== "graduate";
  const reasonRequired = isReasonRequired(action, category);

  const submit = async () => {
    const trimmedReason = reason.trim();
    if (showReason && reasonRequired && !trimmedReason) {
      setReasonError(t("students.statusActions.errors.reasonRequired"));
      return;
    }
    if (trimmedReason.length > REASON_MAX_LENGTH) {
      setReasonError(t("students.statusActions.errors.reasonTooLong", { max: REASON_MAX_LENGTH }));
      return;
    }
    setReasonError(null);
    setBannerMessage(null);
    setIsSaving(true);

    // Optional fields are left undefined (dropped by JSON.stringify), never
    // sent as "" — {} is a valid withdraw/restore/graduate body.
    const optionalReason = trimmedReason || undefined;
    const effective_on = effectiveOn || undefined;
    let result: CrudResult<unknown>;
    let successKey: SuccessKey;
    if (action === "withdraw") {
      if (category === "withdrawn") {
        result = await changeStudentStatus(student.id, "withdraw", { reason: optionalReason, effective_on });
      } else {
        result = await changeStudentStatus(student.id, category === "suspended" ? "suspend" : "expel", {
          reason: trimmedReason,
          effective_on,
        });
      }
      successKey = category;
    } else if (action === "reactivate") {
      result = await changeStudentStatus(student.id, "reactivate", { reason: trimmedReason, effective_on });
      successKey = "reactivated";
    } else if (action === "restore") {
      result = await changeStudentStatus(student.id, "restore", { reason: optionalReason, effective_on });
      successKey = "restored";
    } else {
      result = await changeStudentStatus(student.id, "graduate", { effective_on });
      successKey = "graduated";
    }
    setIsSaving(false);

    if (!result.ok) {
      // INVALID_STATUS_TRANSITION (409) and friends carry the backend's own
      // explanation — shown verbatim in the panel, which stays open.
      const message = "message" in result ? result.message : undefined;
      setBannerMessage(message ?? t("students.statusActions.errors.failed"));
      return;
    }
    onDone(t(`students.statusActions.success.${successKey}`, { name }));
  };

  const saveLabel =
    action === "withdraw"
      ? t(`students.statusActions.confirm.${category}`)
      : t(`students.statusActions.confirm.${action}`);

  return (
    <SlideOverPanel
      isOpen
      onClose={onClose}
      title={t(`students.statusActions.titles.${action}`)}
      subtitle={name}
      onSave={() => void submit()}
      saveLabel={saveLabel}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {bannerMessage ? (
          <p role="alert" className="rounded-md border border-error px-4 py-3 text-sm text-error">
            {bannerMessage}
          </p>
        ) : null}

        <p className="text-sm text-text-secondary">{t(`students.statusActions.descriptions.${action}`)}</p>

        {action === "reactivate" && student.status === "expelled" ? (
          <p className="rounded-md border border-warning px-4 py-3 text-sm text-warning">
            {t("students.statusActions.expelledWarning")}
          </p>
        ) : null}

        {action === "withdraw" ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-primary">{t("students.statusActions.fields.category")}</span>
            <ChipGroup
              multiple={false}
              options={[
                { value: "withdrawn", label: t("students.status.withdrawn") },
                { value: "suspended", label: t("students.status.suspended") },
                { value: "expelled", label: t("students.status.expelled") },
              ]}
              value={[category]}
              onChange={(values) => {
                // Single-select ChipGroup can emit [] when the active chip is
                // clicked again — a category is always required, so keep it.
                if (values[0]) setCategory(values[0] as WithdrawCategory);
                setReasonError(null);
              }}
            />
          </div>
        ) : null}

        {showReason ? (
          <TextareaField
            id="status-reason"
            label={
              reasonRequired
                ? t("students.statusActions.fields.reason")
                : t("students.statusActions.fields.reasonOptional")
            }
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            hasError={!!reasonError}
            error={reasonError ?? undefined}
          />
        ) : null}

        <InputField
          id="status-effective-on"
          type="date"
          label={t("students.statusActions.fields.effectiveOn")}
          value={effectiveOn}
          onChange={(event) => setEffectiveOn(event.target.value)}
        />
      </div>
    </SlideOverPanel>
  );
}

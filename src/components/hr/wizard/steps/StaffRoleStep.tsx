"use client";

import { useTranslations } from "next-intl";
import { SelectField } from "@/components/ui/Select";
import { MultiSearchableSelect } from "@/components/ui/MultiSearchableSelect";
import { DevBypassNotice } from "@/components/students/wizard/DevBypassNotice";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import { StaffTeachingAssignments } from "@/components/hr/wizard/sections/StaffTeachingAssignments";
import type { HrReferenceData } from "@/components/hr/useHrReferenceData";
import type { FieldErrors, StaffForm } from "@/components/hr/wizard/staffForm";

type StepProps = {
  form: StaffForm;
  onChange: (patch: Partial<StaffForm>) => void;
  errors: FieldErrors;
  refs: HrReferenceData;
  /** The header's selected year (teaching assignments belong to it). Null = no year selected. */
  yearId: string | null;
  yearName: string | null;
  carriedFromYearName: string | null;
};

/**
 * Step 2 — Role & assignments: Staff type + Post (required) +
 * Department(s), then the teaching-only Subject and Class-teacher
 * assignments (not rendered at all for non-teaching staff), then
 * Permission Group(s). Only ACTIVE posts are offered, plus the staff's
 * current post even if it's since been deactivated (so editing doesn't
 * silently clear it). Departments are the real /erp/departments — empty
 * under dev-bypass. Groups own membership; picking them here sends
 * permission_group_ids and the backend updates the groups.
 */
export function StaffRoleStep({ form, onChange, errors, refs, yearId, yearName, carriedFromYearName }: StepProps) {
  const t = useTranslations();
  const postOptions = refs.posts.filter((post) => post.is_active || post.id === form.post_id);

  return (
    <div className="flex flex-col gap-6">
      <StaffStepSection title={t("hr.wizard.sections.post.title")} subtitle={t("hr.wizard.sections.post.subtitle")}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-text-primary">{t("hr.wizard.fields.staffType.label")}</legend>
          <div className="flex flex-wrap gap-5">
            {(["teaching", "non_teaching"] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="staff-type"
                  value={type}
                  checked={form.staff_type === type}
                  onChange={() => onChange({ staff_type: type })}
                  className="h-4 w-4 accent-accent"
                />
                {t(`hr.staffs.tabs.${type}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {form.staff_type === "non_teaching" && (form.subject_assignments.length > 0 || form.class_teacher_assignments.length > 0) ? (
          <p className="text-xs text-warning">{t("hr.wizard.fields.staffType.nonTeachingDropsSubjects")}</p>
        ) : null}

        <SelectField
          id="staff-post"
          label={t("hr.wizard.fields.post.label")}
          value={form.post_id}
          onChange={(event) => onChange({ post_id: event.target.value })}
          disabled={refs.isLoadingPosts}
          hasError={!!errors.post_id}
          error={errors.post_id ? t(errors.post_id) : undefined}
        >
          <option value="" disabled>
            {refs.isLoadingPosts ? t("hr.common.loading") : t("hr.wizard.fields.post.placeholder")}
          </option>
          {postOptions.map((post) => (
            <option key={post.id} value={post.id}>
              {post.is_active ? post.name : t("hr.wizard.fields.post.inactive", { name: post.name })}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1.5">
          <MultiSearchableSelect
            id="staff-departments"
            label={t("hr.wizard.fields.departments.label")}
            placeholder={t("hr.wizard.fields.departments.placeholder")}
            options={refs.departments.map((department) => ({ value: department.id, label: department.name }))}
            value={form.department_ids}
            onChange={(department_ids) => onChange({ department_ids })}
            noOptionsLabel={t("hr.wizard.fields.departments.noOptions")}
          />
          {refs.academicUnavailable ? <DevBypassNotice /> : null}
        </div>
      </StaffStepSection>

      <StaffTeachingAssignments
        yearId={yearId}
        form={form}
        onChange={onChange}
        errors={errors}
        refs={refs}
        yearName={yearName}
        carriedFromYearName={carriedFromYearName}
      />

      <StaffStepSection title={t("hr.wizard.sections.groups.title")} subtitle={t("hr.wizard.sections.groups.subtitle")}>
        <MultiSearchableSelect
          id="staff-permission-groups"
          label={t("hr.wizard.fields.groups.label")}
          placeholder={refs.isLoadingGroups ? t("hr.common.loading") : t("hr.wizard.fields.groups.placeholder")}
          options={refs.groups.map((group) => ({ value: group.id, label: group.name }))}
          value={form.permission_group_ids}
          onChange={(permission_group_ids) => onChange({ permission_group_ids })}
          disabled={refs.isLoadingGroups}
          noOptionsLabel={t("hr.wizard.fields.groups.noOptions")}
        />
      </StaffStepSection>
    </div>
  );
}

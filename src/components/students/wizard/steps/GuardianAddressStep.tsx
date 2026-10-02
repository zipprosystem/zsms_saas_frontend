"use client";

import { useTranslations } from "next-intl";
import { ParentGuardianStep } from "@/components/students/wizard/steps/ParentGuardianStep";
import { AddressStep } from "@/components/students/wizard/steps/AddressStep";
import type { ParentGuardianForm, AddressForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

/** Step 2 of 3 — "Parent/Guardian & Address". Regroups the original standalone Parent/Guardian and Address steps; field logic unchanged. */
export function GuardianAddressStep({
  parentGuardian,
  address,
  errors,
  onParentGuardianChange,
  onAddressChange,
}: {
  parentGuardian: ParentGuardianForm;
  address: AddressForm;
  errors: FieldErrors;
  onParentGuardianChange: (patch: Partial<ParentGuardianForm>) => void;
  onAddressChange: (patch: Partial<AddressForm>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.parentGuardian")}</p>
        <ParentGuardianStep data={parentGuardian} errors={errors} onChange={onParentGuardianChange} />
      </section>

      <section className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.address")}</p>
        <AddressStep data={address} errors={errors} onChange={onAddressChange} />
      </section>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { AgentStep } from "@/components/students/wizard/steps/AgentStep";
import { SiblingsStep } from "@/components/students/wizard/steps/SiblingsStep";
import { PastRecordsStep } from "@/components/students/wizard/steps/PastRecordsStep";
import type { AgentForm, SiblingsForm, PastRecordsForm } from "@/components/students/wizard/studentFormTypes";

/** Step 3 of 3 — "Additional". Regroups the original standalone Agent/Siblings/Past Records steps (all optional); field logic unchanged. */
export function AdditionalStep({
  agent,
  siblings,
  pastRecords,
  excludeStudentId,
  onAgentChange,
  onSiblingsChange,
  onPastRecordsChange,
}: {
  agent: AgentForm;
  siblings: SiblingsForm;
  pastRecords: PastRecordsForm;
  excludeStudentId?: string;
  onAgentChange: (patch: Partial<AgentForm>) => void;
  onSiblingsChange: (patch: Partial<SiblingsForm>) => void;
  onPastRecordsChange: (patch: Partial<PastRecordsForm>) => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.agent")}</p>
        <AgentStep data={agent} onChange={onAgentChange} />
      </section>

      <section className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.siblings")}</p>
        <SiblingsStep data={siblings} onChange={onSiblingsChange} excludeStudentId={excludeStudentId} />
      </section>

      <section className="border-t border-border pt-6">
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.sections.pastRecords")}</p>
        <PastRecordsStep data={pastRecords} onChange={onPastRecordsChange} />
      </section>
    </div>
  );
}

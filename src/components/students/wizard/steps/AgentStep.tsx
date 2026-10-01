"use client";

import { useTranslations } from "next-intl";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toggle } from "@/components/ui/Toggle";
import { MOCK_AGENTS } from "@/lib/students/studentsMockData";
import type { AgentForm } from "@/components/students/wizard/studentFormTypes";

/** Entirely optional — a referral agent picker. Per Matthew's ruling: no second select (only agent_id + the one commission checkbox). */
export function AgentStep({ data, onChange }: { data: AgentForm; onChange: (patch: Partial<AgentForm>) => void }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-5">
      <SearchableSelect
        id="wizard-agent"
        label={t("students.wizard.fields.agent.label")}
        placeholder={t("students.wizard.fields.agent.placeholder")}
        options={MOCK_AGENTS.map((agent) => ({
          value: agent.id,
          label: agent.agency ? `${agent.name} — ${agent.agency}` : agent.name,
        }))}
        value={data.agent_id}
        onChange={(agent_id) => onChange({ agent_id })}
        noOptionsLabel={t("onboarding.common.noResults")}
      />

      <Toggle
        id="wizard-agent-commission"
        label={t("students.wizard.fields.agentCommission.label")}
        checked={data.has_agent_commission}
        onChange={(checked) => onChange({ has_agent_commission: checked })}
      />
    </div>
  );
}

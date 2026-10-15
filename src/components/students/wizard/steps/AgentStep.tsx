"use client";

import { useTranslations } from "next-intl";
import { Toggle } from "@/components/ui/Toggle";
import { ComingSoonField } from "@/components/students/wizard/ComingSoonField";
import type { AgentForm } from "@/components/students/wizard/studentFormTypes";

/**
 * Entirely optional. The agent picker itself is "Coming soon" — the
 * Student Core API rejects agent_id until agents exist backend-side — but
 * has_agent_commission IS a supported field, so its toggle stays live.
 */
export function AgentStep({ data, onChange }: { data: AgentForm; onChange: (patch: Partial<AgentForm>) => void }) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-5">
      <ComingSoonField label={t("students.wizard.fields.agent.label")} />

      <Toggle
        id="wizard-agent-commission"
        label={t("students.wizard.fields.agentCommission.label")}
        checked={data.has_agent_commission}
        onChange={(checked) => onChange({ has_agent_commission: checked })}
      />
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Segmented } from "@/components/ui/Segmented";
import { useToast } from "@/components/ui/Toast";
import {
  ATTAINMENT_DISPLAYS,
  DEFAULT_ATTAINMENT_DISPLAY,
  examSettingsQueryKey,
  getExamSettings,
  updateExamSettings,
  type AttainmentDisplay,
} from "@/lib/exam/settings/examSettingsApi";

/**
 * School setting: how British attainment grades read across the Academic
 * Report and the Progression broadsheet — the grade's numeric weight
 * (default) or its grade label. Display only; VA is always the weight
 * difference.
 */
export function AttainmentDisplaySetting() {
  const t = useTranslations("setup.grades.attainmentDisplay");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const query = useQuery({ queryKey: examSettingsQueryKey, queryFn: getExamSettings });
  const value: AttainmentDisplay = query.data?.ok ? query.data.data.attainment_display : DEFAULT_ATTAINMENT_DISPLAY;

  const mutation = useMutation({
    mutationFn: (display: AttainmentDisplay) => updateExamSettings({ attainment_display: display }),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.setQueryData(examSettingsQueryKey, result);
        showToast(t("saved"));
      } else {
        showToast(t("saveFailed"), "error");
      }
    },
    onError: () => showToast(t("saveFailed"), "error"),
  });

  return (
    <section aria-labelledby="attainment-display-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 id="attainment-display-title" className="text-base font-semibold text-text-primary">
          {t("title")}
        </h3>
        <p className="text-sm text-text-secondary">{t("description")}</p>
      </div>
      <Segmented
        label={t("label")}
        options={ATTAINMENT_DISPLAYS.map((display) => ({ value: display, label: t(`options.${display}`) }))}
        value={mutation.isPending && mutation.variables ? mutation.variables : value}
        onChange={(display) => {
          if (display !== value && !mutation.isPending) mutation.mutate(display);
        }}
      />
      <p className="text-xs text-text-muted">{t(`help.${value}`)}</p>
    </section>
  );
}

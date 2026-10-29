"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import { attainmentAutoFillQueryKey, listAttainmentAutoFill, updateAttainmentAutoFill } from "@/lib/exam/settings/examSettingsApi";
import { resultsQueryKeys } from "@/lib/exam/resultsApi";
import { broadsheetQueryKeys } from "@/lib/exam/broadsheet/broadsheetApi";

/**
 * Per-class setting (spec §7.22): auto-fill Current Attainment on the
 * Academic Report from the Grade Book (/100 → the class's attainment score
 * ranges → grade + weight). Default ON for KS3, OFF for KS4; each British
 * class can be switched. When on, a teacher can still override the grade;
 * Engagement and Learning Behaviour stay manual. Contract: examSettingsApi.ts.
 */
export function AttainmentAutoFillSetting() {
  const t = useTranslations("setup.grades.attainmentAutoFill");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const query = useQuery({ queryKey: attainmentAutoFillQueryKey, queryFn: listAttainmentAutoFill });
  const items = query.data?.ok ? query.data.data : [];

  const mutation = useMutation({
    mutationFn: ({ classId, on }: { classId: string; on: boolean }) => updateAttainmentAutoFill(classId, on),
    onSuccess: (result) => {
      if (!result.ok) {
        showToast(t("saveFailed"), "error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: attainmentAutoFillQueryKey });
      // Attainment is filled on read: entry sheets, results / VA / report cards and Progression change with it.
      for (const queryKey of [["exam", "marks"], resultsQueryKeys.all, broadsheetQueryKeys.all]) void queryClient.invalidateQueries({ queryKey });
      showToast(t(result.data.auto_fill_attainment ? "savedOn" : "savedOff", { name: result.data.class_name }));
    },
    onError: () => showToast(t("saveFailed"), "error"),
  });

  return (
    <section aria-labelledby="attainment-auto-fill-title" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-1">
        <h3 id="attainment-auto-fill-title" className="text-base font-semibold text-text-primary">
          {t("title")}
        </h3>
        <p className="text-sm text-text-secondary">{t("description")}</p>
      </div>
      {query.isPending ? (
        <p className="text-sm text-text-muted">{t("loading")}</p>
      ) : !query.data?.ok ? (
        <p className="text-sm text-error">{t("loadFailed")}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <Toggle
              key={item.class_id}
              id={`auto-fill-${item.class_id}`}
              label={item.class_name}
              helper={t("classHelp", { scale: item.scale_name, default: t(item.default_on ? "defaultOn" : "defaultOff") })}
              checked={mutation.isPending && mutation.variables?.classId === item.class_id ? mutation.variables.on : item.auto_fill_attainment}
              onChange={(on) => {
                if (!mutation.isPending) mutation.mutate({ classId: item.class_id, on });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

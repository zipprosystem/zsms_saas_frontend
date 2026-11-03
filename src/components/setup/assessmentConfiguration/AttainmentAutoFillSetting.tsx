"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Toggle } from "@/components/ui/Toggle";
import { useToast } from "@/components/ui/Toast";
import {
  attainmentAutoFillQueryKey,
  listAttainmentAutoFill,
  updateAttainmentAutoFill,
  type ClassAutoFill,
} from "@/lib/exam/settings/examSettingsApi";
import { resultsQueryKeys } from "@/lib/exam/resultsApi";
import { broadsheetQueryKeys } from "@/lib/exam/broadsheet/broadsheetApi";

/**
 * Per-class setting (spec §7.22): auto-fill Current Attainment on the
 * Academic Report from the Grade Book (/100 → the class's attainment score
 * ranges → grade + weight). A class with no setting of its own follows its
 * School Type's default (Setup › School Types); switching it here sets it
 * for that class, and "Use School Type default" clears it again. When on,
 * a teacher can still override the grade; Engagement and Learning
 * Behaviour stay manual. Contract: examSettingsApi.ts.
 */
export function AttainmentAutoFillSetting() {
  const t = useTranslations("setup.grades.attainmentAutoFill");
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const query = useQuery({ queryKey: attainmentAutoFillQueryKey, queryFn: listAttainmentAutoFill });
  const items = query.data?.ok ? query.data.data : [];

  const mutation = useMutation({
    mutationFn: ({ classId, on }: { classId: string; on: boolean | null }) => updateAttainmentAutoFill(classId, on),
    onSuccess: (result) => {
      if (!result.ok) {
        showToast(t("saveFailed"), "error");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: attainmentAutoFillQueryKey });
      // Attainment is filled on read: entry sheets, results / VA / report cards and Progression change with it.
      for (const queryKey of [["exam", "marks"], resultsQueryKeys.all, broadsheetQueryKeys.all]) void queryClient.invalidateQueries({ queryKey });
      const name = result.data.class_name;
      showToast(result.data.class_setting === null ? t("savedDefault", { name }) : t(result.data.auto_fill_attainment ? "savedOn" : "savedOff", { name }));
    },
    onError: () => showToast(t("saveFailed"), "error"),
  });

  /** Where the class's value comes from: its own setting, or its School Type's default. */
  const sourceText = (item: ClassAutoFill) => {
    const typeDefault = t(item.default_on ? "on" : "off");
    if (!item.school_type_id) return t(item.class_setting === null ? "noTypeDefault" : "setNoType");
    const type = item.school_type_name ?? t("unnamedType");
    return item.class_setting === null ? t("followsType", { type, value: typeDefault }) : t("setForClass", { type, value: typeDefault });
  };

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
          {items.map((item) => {
            const pending = mutation.isPending && mutation.variables?.classId === item.class_id ? mutation.variables.on : undefined;
            return (
              <div key={item.class_id} className="flex flex-col gap-1">
                <Toggle
                  id={`auto-fill-${item.class_id}`}
                  label={item.class_name}
                  helper={t("classHelp", { scale: item.scale_name, source: sourceText(item) })}
                  checked={pending === undefined ? item.auto_fill_attainment : (pending ?? item.default_on)}
                  onChange={(on) => {
                    if (!mutation.isPending) mutation.mutate({ classId: item.class_id, on });
                  }}
                />
                {item.class_setting !== null ? (
                  <button
                    type="button"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ classId: item.class_id, on: null })}
                    className="self-end text-xs font-semibold text-accent hover:underline disabled:opacity-50"
                  >
                    {t("useTypeDefault")}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

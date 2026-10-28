"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { getResultArms, resultsQueryKeys } from "@/lib/exam/resultsApi";
import type { ResultsArms } from "@/lib/exam/results/resultsTypes";
import { failureMessage, MockActingAsPicker, Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { ArmCardsView, ClassArmSelects, YearTermSelects } from "@/components/exam/results/ArmCardsView";
import type { ResultsNavigate, ResultsParams } from "@/components/exam/results/ResultsScreen";
import { GeneralBroadsheet } from "@/components/exam/broadsheet/GeneralBroadsheet";
import { CumulativeBroadsheet } from "@/components/exam/broadsheet/CumulativeBroadsheet";
import { ProgressionBroadsheet } from "@/components/exam/broadsheet/ProgressionBroadsheet";

/** The class view's sub-tabs. Component classes: Broadsheet + Cumulative Broadsheet. Grade classes: Progression. */
export const BROADSHEET_VIEWS = ["broadsheet", "cumulative", "progression"] as const;
export type BroadsheetView = (typeof BROADSHEET_VIEWS)[number];

const VIEWS_BY_MODE: Record<ResultsArms["items"][number]["assessment_mode"], BroadsheetView[]> = {
  component_based: ["broadsheet", "cumulative"],
  grade_based: ["progression"],
};

/**
 * Academics › Exam › Broad Sheet (Stage 2b) — a drill-down like View
 * Results:
 *
 *   1. Arm cards grouped by class (?year&term&class): students, subjects,
 *      "View Broadsheet".
 *   2. The arm's broadsheet (?arm=&view=), with sub-tabs routed by the
 *      class's assessment mode — General: Broadsheet + Cumulative
 *      Broadsheet; British: Progression.
 *
 * Arm cards reuse GET erp/results/arms (same scope as View Results). Every
 * number comes from the engine via the backend (broadsheetApi.ts).
 */
export function BroadSheetScreen() {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [actingAs, setActingAs] = useMockActingAs();

  const params: ResultsParams = {
    year: searchParams.get("year") ?? "",
    term: searchParams.get("term") ?? "",
    class: searchParams.get("class") ?? "",
    arm: searchParams.get("arm") ?? "",
  };
  const viewParam = searchParams.get("view") ?? "";

  const navigate = (patch: Partial<ResultsParams & { view: string }>, mode: "push" | "replace" = "replace") => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    if (mode === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  };

  const armsQuery = useQuery({
    queryKey: [...resultsQueryKeys.arms(params.year, params.term), actingAs],
    queryFn: () => getResultArms(params.year, params.term).then(throwIfTransient),
  });
  const arms = armsQuery.data?.ok ? armsQuery.data.data : null;

  let body;
  if (armsQuery.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!arms) {
    body = (
      <Notice tone={isDevBypassUnavailable(armsQuery.data) ? "warning" : "error"}>
        {failureMessage(armsQuery.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (params.arm) {
    body = <BroadsheetClassView arms={arms} params={params} viewParam={viewParam} navigate={navigate} actingAs={actingAs} />;
  } else {
    body = <ArmCardsView arms={arms} params={params} navigate={navigate} variant="broadsheet" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{t("exam.broadSheet.title")}</h2>
        <p className="text-sm text-text-secondary">{t("exam.broadSheet.subtitle")}</p>
      </div>
      <MockActingAsPicker
        value={actingAs}
        onChange={(id) => {
          setActingAs(id);
          // The new caller's scope may not include this class / arm.
          navigate({ class: "", arm: "" });
        }}
      />
      {body}
    </div>
  );
}

function BroadsheetClassView({
  arms,
  params,
  viewParam,
  navigate,
  actingAs,
}: {
  arms: ResultsArms;
  params: ResultsParams;
  viewParam: string;
  navigate: (patch: Partial<ResultsParams & { view: string }>) => void;
  actingAs: string;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const current = arms.items.find((item) => item.class_arm_id === params.arm) ?? null;

  const backHref = `${pathname}?${new URLSearchParams({ year: arms.academic_year_id, term: arms.term_id })}`;
  const back = (
    <Link href={backHref} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-accent hover:underline">
      <span aria-hidden>←</span> {t("exam.viewResults.list.backToClasses")}
    </Link>
  );

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Notice>{t("exam.viewResults.list.armNotInScope")}</Notice>
      </div>
    );
  }

  const views = VIEWS_BY_MODE[current.assessment_mode];
  const view = views.find((item) => item === viewParam) ?? views[0];
  const navigateArm: ResultsNavigate = (patch) => navigate(patch);
  const armLabel = t("exam.viewResults.armName", { class: current.class_name, arm: current.arm_name });

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {back}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <YearTermSelects arms={arms} navigate={navigateArm} />
        <ClassArmSelects arms={arms} current={current} navigate={navigateArm} />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label={t("exam.broadSheet.tabs.label")}>
        {views.map((item) => {
          const active = item === view;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              id={`broadsheet-tab-${item}`}
              aria-selected={active}
              aria-controls="broadsheet-panel"
              onClick={() => navigate({ view: item })}
              className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                active ? "border-accent text-accent" : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t(`exam.broadSheet.tabs.${item}`)}
            </button>
          );
        })}
      </div>

      <div id="broadsheet-panel" role="tabpanel" aria-labelledby={`broadsheet-tab-${view}`} className="flex min-w-0 flex-col gap-4">
        {view === "broadsheet" ? (
          <GeneralBroadsheet armId={current.class_arm_id} termId={arms.term_id} armLabel={armLabel} actingAs={actingAs} />
        ) : view === "cumulative" ? (
          <CumulativeBroadsheet armId={current.class_arm_id} termId={arms.term_id} armLabel={armLabel} actingAs={actingAs} />
        ) : (
          <ProgressionBroadsheet armId={current.class_arm_id} termId={arms.term_id} armLabel={armLabel} actingAs={actingAs} />
        )}
      </div>
    </div>
  );
}

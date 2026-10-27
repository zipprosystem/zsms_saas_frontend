"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { getResultArms, resultsQueryKeys } from "@/lib/exam/resultsApi";
import { failureMessage, MockActingAsPicker, Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { ArmCardsView } from "@/components/exam/results/ArmCardsView";
import { ClassResultList } from "@/components/exam/results/ClassResultList";

/** URL state for View Results (so reloads, back/forward and search deep links work). */
export type ResultsParams = { year: string; term: string; class: string; arm: string };
export type ResultsNavigate = (patch: Partial<ResultsParams>, mode?: "push" | "replace") => void;

/**
 * Academics › Exam › Results › View Results (results reframe, 2026-10-27)
 * — a report drill-down, not a matrix (the matrix moved to Broad Sheet):
 *
 *   1. Arm cards grouped by class (?year&term&class), each with its size
 *      and class average and a "View Class Result" action.
 *   2. The arm's student list (?arm=) — rank, total average, class average
 *      on top; per student View Report (template render: NOT BUILT YET,
 *      disabled) and, for the class teacher only, traits + remarks entry.
 *
 * One arms query feeds both levels (the cards, and the list's class / arm
 * filters). Scope and role come from the backend (mock: the acting-as
 * picker). Every number is computed by the engine (resultsApi.ts).
 */
export function ResultsScreen() {
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

  const navigate: ResultsNavigate = (patch, mode = "replace") => {
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
    body = <ClassResultList arms={arms} params={params} navigate={navigate} actingAs={actingAs} />;
  } else {
    body = <ArmCardsView arms={arms} params={params} navigate={navigate} />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{t("exam.viewResults.title")}</h2>
        <p className="text-sm text-text-secondary">{t("exam.viewResults.subtitle")}</p>
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

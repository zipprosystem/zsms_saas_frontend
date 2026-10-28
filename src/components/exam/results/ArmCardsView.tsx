"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SelectField } from "@/components/ui/Select";
import type { ArmResultSummary, ResultsArms } from "@/lib/exam/results/resultsTypes";
import { Notice } from "@/components/exam/examEntryShared";
import { useResultNumber } from "@/components/exam/results/resultsDisplay";
import type { ResultsNavigate, ResultsParams } from "@/components/exam/results/ResultsScreen";

/** Year / term select options shared by both View Results levels. */
export function YearTermSelects({ arms, navigate }: { arms: ResultsArms; navigate: ResultsNavigate }) {
  const t = useTranslations();
  return (
    <>
      <SelectField
        id="results-filter-year"
        label={t("exam.marks.filters.year")}
        value={arms.academic_year_id}
        onChange={(event) => navigate({ year: event.target.value, term: "" })}
      >
        {arms.years.map((year) => (
          <option key={year.id} value={year.id}>
            {year.is_current ? t("exam.marks.filters.currentYear", { name: year.name }) : year.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="results-filter-term"
        label={t("exam.marks.filters.term")}
        value={arms.term_id}
        disabled={arms.terms.length === 0}
        onChange={(event) => navigate({ term: event.target.value })}
      >
        {arms.terms.map((term) => (
          <option key={term.id} value={term.id}>
            {term.name}
          </option>
        ))}
      </SelectField>
    </>
  );
}

/** The classes present in the arms list, in school order. */
export function classesOf(items: ArmResultSummary[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const item of items) if (!seen.has(item.class_id)) seen.set(item.class_id, item.class_name);
  return Array.from(seen, ([id, name]) => ({ id, name }));
}

/** Class + arm selects for a drill-down's class level (picking a class opens its first arm). */
export function ClassArmSelects({ arms, current, navigate }: { arms: ResultsArms; current: ArmResultSummary; navigate: ResultsNavigate }) {
  const t = useTranslations();
  const classes = classesOf(arms.items);
  const classArms = arms.items.filter((item) => item.class_id === current.class_id);
  return (
    <>
      <SelectField
        id="results-filter-class"
        label={t("exam.marks.filters.class")}
        value={current.class_id}
        onChange={(event) => {
          const first = arms.items.find((item) => item.class_id === event.target.value);
          if (first) navigate({ arm: first.class_arm_id });
        }}
      >
        {classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name}
          </option>
        ))}
      </SelectField>
      <SelectField id="results-filter-arm" label={t("exam.marks.filters.arm")} value={current.class_arm_id} onChange={(event) => navigate({ arm: event.target.value })}>
        {classArms.map((item) => (
          <option key={item.class_arm_id} value={item.class_arm_id}>
            {item.arm_name}
          </option>
        ))}
      </SelectField>
    </>
  );
}

/**
 * Level 1 of View Results (and of Broad Sheet): one card per arm in
 * scope, grouped by class. "results" cards show the class average and
 * open the class result; "broadsheet" cards show the subject count and
 * open the broadsheet.
 */
export function ArmCardsView({
  arms,
  params,
  navigate,
  variant = "results",
}: {
  arms: ResultsArms;
  params: ResultsParams;
  navigate: ResultsNavigate;
  variant?: "results" | "broadsheet";
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.viewResults.${key}`, values);
  const n = useResultNumber();
  const pathname = usePathname();

  const classes = classesOf(arms.items);
  const classFilter = classes.some((cls) => cls.id === params.class) ? params.class : "";
  const groups = classes
    .filter((cls) => !classFilter || cls.id === classFilter)
    .map((cls) => ({ ...cls, arms: arms.items.filter((item) => item.class_id === cls.id) }));

  const searchParams = useSearchParams();
  const armHref = (item: ArmResultSummary) => {
    const query = new URLSearchParams({ year: arms.academic_year_id, term: arms.term_id, arm: item.class_arm_id });
    // Broad Sheet: a preselected view (e.g. from search) carries into the class.
    const view = variant === "broadsheet" ? searchParams.get("view") : null;
    if (view) query.set("view", view);
    return `${pathname}?${query}`;
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <YearTermSelects arms={arms} navigate={navigate} />
        <SelectField id="results-filter-class" label={t("exam.marks.filters.class")} value={classFilter} onChange={(event) => navigate({ class: event.target.value })}>
          <option value="">{k("filters.allClasses")}</option>
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name}
            </option>
          ))}
        </SelectField>
      </div>

      {groups.length === 0 ? (
        <Notice>{arms.full_scope ? k("empty.noClasses") : k("empty.noScope")}</Notice>
      ) : (
        groups.map((group) => (
          <section key={group.id} aria-labelledby={`results-class-${group.id}`} className="flex flex-col gap-3">
            <h3 id={`results-class-${group.id}`} className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
              {group.name}
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.arms.map((item) => (
                <article key={item.class_arm_id} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-base font-semibold text-text-primary">{k("armName", { class: item.class_name, arm: item.arm_name })}</h4>
                    <p className="text-xs text-text-muted">{t(`exam.results.modes.${item.assessment_mode}`)}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-xs text-text-muted">{k("card.students")}</dt>
                      <dd className="text-lg font-semibold text-text-primary">{item.student_count}</dd>
                    </div>
                    {variant === "broadsheet" ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs text-text-muted">{t("exam.broadSheet.card.subjects")}</dt>
                        <dd className="text-lg font-semibold text-text-primary">{item.subject_count}</dd>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs text-text-muted">{k("card.classAverage")}</dt>
                        <dd className="text-lg font-semibold text-text-primary">
                          {item.assessment_mode === "grade_based" ? (
                            <span className="text-sm font-medium text-text-muted">{k("card.gradeBased")}</span>
                          ) : (
                            n(item.class_average)
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <Link
                    href={armHref(item)}
                    className="mt-auto inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    {variant === "broadsheet" ? t("exam.broadSheet.card.viewBroadsheet") : k("card.viewClassResult")}
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import { NAV_PERMISSIONS } from "@/lib/auth/navPermissions";
import { SelectField } from "@/components/ui/Select";
import { failureMessage, MockActingAsPicker, Notice, useMockActingAs } from "@/components/exam/examEntryShared";
import { reportProgressionClassHref } from "@/components/exam/examTabsConfig";
import {
  getProgressionClasses,
  isProgressionPoint,
  reportProgressionQueryKeys,
  type ProgressionClassCard,
  type ProgressionPoint,
} from "@/lib/exam/reportProgression/reportProgressionApi";
import { PointSelect, ProgressionBar, SearchBox, useCanSee } from "@/components/exam/reportProgression/progressionShared";

/**
 * Academics › Exam › Report Progression — landing (Figma 2499:355273):
 * one card per class in scope with its students, subjects and the
 * PROGRESSION % (derived by the backend: filled ÷ required, §7.30) for
 * the chosen term + point; "View Class Progression" opens the class.
 * URL state: ?year&term&point&class (filter)&q (search class / type / term).
 */
export function ReportProgressionScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.reportProgression.${key}`, values);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [actingAs, setActingAs] = useMockActingAs();
  const canView = useCanSee(NAV_PERMISSIONS.examReportProgression);

  const year = searchParams.get("year") ?? "";
  const term = searchParams.get("term") ?? "";
  const pointParam = searchParams.get("point");
  const point: ProgressionPoint = isProgressionPoint(pointParam) ? pointParam : "ca";
  const classFilter = searchParams.get("class") ?? "";
  const search = searchParams.get("q") ?? "";

  const navigate = (patch: Record<string, string>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const query = useQuery({
    queryKey: [...reportProgressionQueryKeys.classes(year, term, point), actingAs],
    queryFn: () => getProgressionClasses(year, term, point).then(throwIfTransient),
    enabled: canView,
  });
  const data = query.data?.ok ? query.data.data : null;

  if (!canView) return <Notice tone="warning">{k("noAccess")}</Notice>;

  const termName = data?.terms.find((item) => item.id === data.term_id)?.name ?? "";
  const needle = search.trim().toLowerCase();
  const cards = (data?.items ?? []).filter(
    (item) =>
      (!classFilter || item.class_id === classFilter) &&
      (!needle || [item.class_name, item.school_type_name ?? "", termName].some((text) => text.toLowerCase().includes(needle))),
  );

  const cardHref = (item: ProgressionClassCard) =>
    `${reportProgressionClassHref(item.class_id)}?${new URLSearchParams({ term: data?.term_id ?? "", point })}`;

  let body;
  if (query.isPending) {
    body = <Notice>{t("exam.marks.loading")}</Notice>;
  } else if (!data) {
    body = (
      <Notice tone={isDevBypassUnavailable(query.data) ? "warning" : "error"}>
        {failureMessage(query.data, t) ?? t("setup.dataTable.errors.loadFailed")}
      </Notice>
    );
  } else if (data.items.length === 0) {
    body = <Notice>{data.full_scope ? k("empty.noClasses") : k("empty.noScope")}</Notice>;
  } else if (cards.length === 0) {
    body = <Notice>{k("empty.noMatch")}</Notice>;
  } else {
    body = (
      <section aria-labelledby="progression-classes" className="flex flex-col gap-4">
        <h3 id="progression-classes" className="text-base font-semibold text-text-primary">
          {k("classesCount", { count: cards.length })}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((item) => (
            <article key={item.class_id} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-text-secondary">
                  <CapIcon />
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h4 className="truncate text-sm font-semibold text-text-primary">{item.class_name}</h4>
                  <p className="truncate text-xs text-text-muted">{item.school_type_name ?? t(`exam.results.modes.${item.assessment_mode}`)}</p>
                </div>
              </div>
              <dl className="flex items-center justify-between gap-3 text-xs text-text-secondary">
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
                  <dt className="sr-only">{k("card.studentsLabel")}</dt>
                  <dd>{k("card.students", { count: item.student_count })}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-error" />
                  <dt className="sr-only">{k("card.subjectsLabel")}</dt>
                  <dd>{k("card.subjects", { count: item.subject_count })}</dd>
                </div>
              </dl>
              <ProgressionBar percent={item.progression_percent} label={k("card.progressionOf", { class: item.class_name })} />
              <Link
                href={cardHref(item)}
                className="mt-auto inline-flex h-10 items-center justify-center rounded-md bg-brand-tint px-4 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              >
                {k("card.view")}
              </Link>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-text-primary">{k("title")}</h2>
        <p className="text-sm text-text-secondary">{k("subtitle")}</p>
      </div>
      <MockActingAsPicker
        value={actingAs}
        onChange={(id) => {
          setActingAs(id);
          navigate({ class: "" });
        }}
      />
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <SearchBox id="progression-search" value={search} onChange={(value) => navigate({ q: value })} placeholder={k("filters.search")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            id="progression-year"
            label={t("exam.marks.filters.year")}
            value={data?.academic_year_id ?? year}
            disabled={!data}
            onChange={(event) => navigate({ year: event.target.value, term: "" })}
          >
            {(data?.years ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.is_current ? t("exam.marks.filters.currentYear", { name: item.name }) : item.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="progression-term"
            label={t("exam.marks.filters.term")}
            value={data?.term_id ?? term}
            disabled={!data}
            onChange={(event) => navigate({ term: event.target.value })}
          >
            {(data?.terms ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <PointSelect id="progression-point" value={point} onChange={(value) => navigate({ point: value })} />
          <SelectField id="progression-class" label={t("exam.marks.filters.class")} value={classFilter} onChange={(event) => navigate({ class: event.target.value })}>
            <option value="">{k("filters.allClasses")}</option>
            {(data?.items ?? []).map((item) => (
              <option key={item.class_id} value={item.class_id}>
                {item.class_name}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
      {body}
    </div>
  );
}

/** Graduation cap (card icon), currentColor. */
function CapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.05 2.53 4.03 6.46c-1.93 1.26-1.93 4.08 0 5.34l6.02 3.93c1.08.71 2.86.71 3.94 0l5.99-3.93c1.92-1.26 1.92-4.07 0-5.33l-5.99-3.93c-1.08-.72-2.86-.72-3.94-.01Z" />
      <path d="m5.63 13.08-.01 4.69c0 1.27.98 2.63 2.18 3.03l3.19 1.06c.55.18 1.46.18 2.02 0l3.19-1.06c1.2-.4 2.18-1.76 2.18-3.03v-4.64M21.4 15V9" />
    </svg>
  );
}

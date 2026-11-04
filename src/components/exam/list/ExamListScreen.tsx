"use client";

import { useDeferredValue, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { SelectField } from "@/components/ui/Select";
import { SetupPagination } from "@/components/setup/SetupPagination";
import { AcademicCapIcon } from "@/components/icons/setup/AcademicCapIcon";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { MoreVerticalIcon } from "@/components/icons/students/MoreVerticalIcon";
import { Button } from "@/components/ui/Button";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { ExamWizard, type ExamWizardProps } from "@/components/exam/list/ExamWizard";
import { Notice, failureMessage, useMockActingAs } from "@/components/exam/examEntryShared";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { isDevBypassUnavailable, throwIfTransient } from "@/lib/setup/crudTypes";
import {
  EXAM_USES_MOCK,
  examQueryKeys,
  getEntryOptions,
  listExamClassCards,
  type ExamCategoryCount,
  type ExamClassCard,
  type ExamClassCardsQuery,
} from "@/lib/exam/examApi";
import { MOCK_ADMIN } from "@/lib/exam/mock/mockActingAs";
import type { Exam, ExamKind } from "@/lib/exam/examTypes";

const PAGE_SIZE = 12;

/**
 * Academics › Exam › List (Figma 2499:348304) — every class's exams as a
 * card: class + School Type, CA / Exam progress (active of listed), and the
 * exam chips (active vs draft). Exams are created automatically per term
 * (General: one per assessment component; British: 1A / 1B) — contract in
 * examApi.ts. Create New Exam / a card's menu open the wizard; a chip opens
 * it on that exam (edit). Admin-gated.
 */
export function ExamListScreen() {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.list.${key}`, values);
  const [actingAs] = useMockActingAs();
  const [yearPick, setYearPick] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [category, setCategory] = useState<ExamKind | "">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDeferredValue(search);
  /** The open wizard: create (optionally for a class) or edit an exam; null = closed. */
  const [wizard, setWizard] = useState<Omit<ExamWizardProps, "onClose"> | null>(null);

  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(yearPick || null), actingAs],
    queryFn: () => getEntryOptions(yearPick || null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const options = optionsQuery.data?.ok ? optionsQuery.data.data : null;
  const yearId = options?.academic_year_id ?? "";
  const terms = options?.terms ?? [];
  const termName = new Map(terms.map((term) => [term.id, term.name]));

  const cardsInput: ExamClassCardsQuery = { yearId, termId, classId, category, q, page, limit: PAGE_SIZE };
  const cardsQuery = useQuery({
    queryKey: [...examQueryKeys.classCards(cardsInput), actingAs],
    queryFn: () => listExamClassCards(cardsInput).then(throwIfTransient),
    enabled: !!yearId,
  });
  const cards = cardsQuery.data?.ok ? cardsQuery.data.data : null;
  const totalPages = cards ? Math.max(1, Math.ceil(cards.total / PAGE_SIZE)) : 1;

  if (EXAM_USES_MOCK && actingAs !== MOCK_ADMIN) return <Notice>{k("adminOnly")}</Notice>;

  /** Any filter change goes back to page 1. */
  const filter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const categoryLabel = (kind: ExamKind) => k(`category.${kind}`);

  let body;
  if (optionsQuery.isPending || (cardsQuery.isPending && cardsQuery.fetchStatus !== "idle")) {
    body = <Notice>{k("loading")}</Notice>;
  } else if (!options || !cards) {
    const failed = options ? cardsQuery.data : optionsQuery.data;
    body = <Notice tone={isDevBypassUnavailable(failed) ? "warning" : "error"}>{failureMessage(failed, t) ?? k("loadFailed")}</Notice>;
  } else if (cards.items.length === 0) {
    body = <Notice>{k("empty")}</Notice>;
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {cards.items.map((card) => (
            <li key={card.class_id}>
              <ClassCard
                card={card}
                termName={termName}
                showTerms={!termId}
                onEdit={(exam) => setWizard({ exam })}
                onCreate={() => setWizard({ classId: card.class_id })}
              />
            </li>
          ))}
        </ul>
        {totalPages > 1 ? (
          <SetupPagination
            page={page}
            totalPages={totalPages}
            onPreviousPage={() => setPage((current) => Math.max(1, current - 1))}
            onNextPage={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        ) : null}
      </>
    );
  }

  return (
    <section aria-labelledby="exam-list-title" className="flex min-w-0 flex-col rounded-xl border border-border bg-surface">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <h2 id="exam-list-title" className="text-base font-semibold text-text-primary">
          {k("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => setWizard({})} icon={<PlusIcon className="h-4 w-4" />} className="w-full px-4 text-sm sm:w-auto">
            {k("createNew")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <input
            type="search"
            value={search}
            onChange={(event) => filter(() => setSearch(event.target.value))}
            placeholder={k("searchPlaceholder")}
            aria-label={k("searchPlaceholder")}
            className="h-11 w-full rounded-md border border-border bg-surface px-4 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent lg:max-w-sm"
          />
          {options ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
              <div className="lg:w-40">
                <SelectField id="exam-list-year" label={k("filters.session")} value={yearId} onChange={(event) => filter(() => { setYearPick(event.target.value); setTermId(""); })}>
                  {options.years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="lg:w-40">
                <SelectField id="exam-list-term" label={k("filters.term")} value={termId} onChange={(event) => filter(() => setTermId(event.target.value))}>
                  <option value="">{k("filters.allTerms")}</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="lg:w-40">
                <SelectField id="exam-list-class" label={k("filters.class")} value={classId} onChange={(event) => filter(() => setClassId(event.target.value))}>
                  <option value="">{k("filters.allClasses")}</option>
                  {options.classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </SelectField>
              </div>
              <div className="lg:w-44">
                <SelectField id="exam-list-category" label={k("filters.examType")} value={category} onChange={(event) => filter(() => setCategory(event.target.value as ExamKind | ""))}>
                  <option value="">{k("filters.allTypes")}</option>
                  <option value="exam">{categoryLabel("exam")}</option>
                  <option value="ca">{categoryLabel("ca")}</option>
                </SelectField>
              </div>
            </div>
          ) : null}
        </div>
        {body}
      </div>
      {wizard ? <ExamWizard {...wizard} onClose={() => setWizard(null)} /> : null}
    </section>
  );
}

function ClassCard({
  card,
  termName,
  showTerms,
  onEdit,
  onCreate,
}: {
  card: ExamClassCard;
  termName: Map<string, string>;
  showTerms: boolean;
  onEdit: (exam: Exam) => void;
  onCreate: () => void;
}) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.list.${key}`, values);
  // Chips grouped by term when every term is shown (General titles like "CA 1" repeat each term).
  const groups = showTerms
    ? Array.from(new Set(card.exams.map((exam) => exam.term_id))).map((termId) => ({ termId, exams: card.exams.filter((exam) => exam.term_id === termId) }))
    : [{ termId: "", exams: card.exams }];

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-category-green-tint text-category-green">
          <AcademicCapIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary">{card.class_name}</h3>
          <p className="truncate text-xs text-text-secondary">{card.school_type_name ?? k("noSchoolType")}</p>
        </div>
        <ActionsMenu
          menuLabel={k("cardMenu", { name: card.class_name })}
          items={[{ key: "create", label: k("createForClass"), onClick: onCreate }]}
          trigger={({ isOpen, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              aria-label={k("cardMenu", { name: card.class_name })}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <MoreVerticalIcon className="h-4 w-4" />
            </button>
          )}
        />
      </header>

      <div className="flex flex-col gap-1.5">
        <ProgressRow label={k("count.ca", { n: card.counts.ca.active })} count={card.counts.ca} barClass="bg-category-amber" dotClass="bg-category-amber" />
        <ProgressRow label={k("count.exam", { n: card.counts.exam.active })} count={card.counts.exam} barClass="bg-error" dotClass="bg-error" />
      </div>

      {card.exams.length === 0 ? (
        <p className="text-xs text-text-muted">{k("noExams")}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {groups.map((group) => (
            <div key={group.termId || "all"} className="flex flex-col gap-1.5">
              {group.termId ? <p className="text-xs font-medium text-text-muted">{termName.get(group.termId) ?? ""}</p> : null}
              <ul className="flex flex-wrap gap-1.5" aria-label={k("chipsLabel", { name: card.class_name })}>
                {group.exams.map((exam) => (
                  <li key={exam.id}>
                    <ExamChip exam={exam} onEdit={() => onEdit(exam)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

/** Active of listed for one category (drafts make the bar fall short). */
function ProgressRow({ label, count, barClass, dotClass }: { label: string; count: ExamCategoryCount; barClass: string; dotClass: string }) {
  const percent = count.total > 0 ? Math.round((count.active / count.total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-subtle-track" role="presentation">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-text-secondary">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {label}
      </span>
    </div>
  );
}

function ExamChip({ exam, onEdit }: { exam: Exam; onEdit: () => void }) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.list.${key}`, values);
  const draft = exam.status === "draft";
  const detail = [
    k(`category.${exam.category}`),
    exam.report_variant ? t(`exam.marks.variants.${exam.report_variant}`) : null,
    exam.entry_closes_on ? k("closes", { date: exam.entry_closes_on }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = draft ? k("draftName", { name: exam.name }) : exam.name;
  return (
    <button
      type="button"
      onClick={onEdit}
      title={detail}
      aria-label={k("editExam", { name: label })}
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        draft ? "border-dashed border-border text-text-muted" : "border-border bg-surface text-text-primary"
      }`}
    >
      {label}
    </button>
  );
}

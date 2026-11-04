"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WideModal } from "@/components/ui/WideModal";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { failureMessage, useMockActingAs } from "@/components/exam/examEntryShared";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import { throwIfTransient, type CrudResult } from "@/lib/setup/crudTypes";
import {
  completeExam,
  createExam,
  examQueryKeys,
  getEntryOptions,
  getExamFormOptions,
  updateExam,
  type ExamFormComponent,
  type ExamInput,
} from "@/lib/exam/examApi";
import type { Exam, ExamKind, ReportVariant } from "@/lib/exam/examTypes";

const NAME_MAX = 60;
const RESULT_TITLE_MAX = 150;

type FormState = {
  category: ExamKind;
  academic_year_id: string;
  term_id: string;
  class_id: string;
  report_variant: ReportVariant;
  /** General: the one assessment component ("" = pick the first free one of the category). */
  component_id: string;
  name: string;
  result_title: string;
  start_date: string;
  end_date: string;
  duration_hours: string;
  report_date: string;
  show_grade_book: boolean;
  show_va: boolean;
};

type Errors = Partial<Record<keyof FormState | "form", string>>;

/** Server field names -> the form's (component_ids is the form's component_id). */
const FIELD_OF: Record<string, keyof FormState> = { component_ids: "component_id" };

function formFromExam(exam: Exam): FormState {
  return {
    category: exam.category,
    academic_year_id: exam.academic_year_id,
    term_id: exam.term_id,
    class_id: exam.class_id,
    report_variant: exam.report_variant ?? (exam.category === "ca" ? "progress" : "full"),
    component_id: exam.component_ids?.[0] ?? "",
    name: exam.name,
    result_title: exam.result_title ?? "",
    start_date: exam.start_date ?? "",
    end_date: exam.end_date ?? "",
    duration_hours: exam.duration_hours === null ? "" : String(exam.duration_hours),
    report_date: exam.report_date ?? "",
    show_grade_book: exam.show_grade_book,
    show_va: exam.show_va,
  };
}

export type ExamWizardProps = {
  /** Edit this exam; omitted = create. */
  exam?: Exam;
  /** Create: start on this class (a card's menu). */
  classId?: string;
  onClose: () => void;
};

/**
 * Create / Edit Exam (Figma 2499:348985, adjusted to the brief). Two steps:
 *   1. One page — category (Exam | CA / Half-Term), Session, Term, Class,
 *      Report Type (British only), Assessment component (General only),
 *      Exam Title, Result Title, Start / End Date, Duration, Report Date,
 *      Gradebook + Tracking (British; greyed for General). "Save &
 *      Continue" saves and lists the exam (a new one as a DRAFT).
 *   2. Schedule — completing it makes the exam ACTIVE (scoreable). The
 *      auto-generated schedule lands here in the next stage.
 * British vs General keys off the class's assessment_mode. Once an exam
 * exists, Session / Term / Class / category / component are locked.
 */
export function ExamWizard({ exam, classId, onClose }: ExamWizardProps) {
  const t = useTranslations();
  const k = (key: string, values?: Record<string, string | number>) => t(`exam.list.wizard.${key}`, values);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [actingAs] = useMockActingAs();

  const [step, setStep] = useState<1 | 2>(1);
  const [saved, setSaved] = useState<Exam | null>(exam ?? null);
  const [form, setForm] = useState<FormState | null>(exam ? formFromExam(exam) : null);
  const [nameTouched, setNameTouched] = useState(!!exam);
  const [variantTouched, setVariantTouched] = useState(!!exam);
  const [errors, setErrors] = useState<Errors>({});
  const locked = !!saved;

  const optionsQuery = useQuery({
    queryKey: [...examQueryKeys.entryOptions(form?.academic_year_id || null), actingAs],
    queryFn: () => getEntryOptions(form?.academic_year_id || null).then(throwIfTransient),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const options = optionsQuery.data?.ok ? optionsQuery.data.data : null;

  // Create: start from the first term / the chosen (or first) class once the options are in.
  const current: FormState | null =
    form ??
    (options
      ? {
          category: "exam",
          academic_year_id: options.academic_year_id,
          term_id: options.terms[0]?.id ?? "",
          class_id: classId && options.classes.some((cls) => cls.id === classId) ? classId : (options.classes[0]?.id ?? ""),
          report_variant: "full",
          component_id: "",
          name: "",
          result_title: "",
          start_date: "",
          end_date: "",
          duration_hours: "",
          report_date: "",
          show_grade_book: true,
          show_va: true,
        }
      : null);

  const formOptionsQuery = useQuery({
    queryKey: [...examQueryKeys.formOptions(current?.class_id ?? "", current?.term_id ?? ""), actingAs],
    queryFn: () => getExamFormOptions(current?.class_id ?? "", current?.term_id ?? "").then(throwIfTransient),
    enabled: !!current?.class_id && !!current?.term_id,
  });
  const formOptions = formOptionsQuery.data?.ok ? formOptionsQuery.data.data : null;

  const classOption = options?.classes.find((cls) => cls.id === current?.class_id);
  const british = (formOptions?.assessment_mode ?? classOption?.assessment_mode) === "grade_based";
  const terms = options?.terms ?? [];

  // General: the components of the chosen category; taken ones (another exam this term) can't be picked.
  const taken = new Set(formOptions?.taken_component_ids ?? []);
  const ownComponent = saved?.component_ids?.[0] ?? "";
  const categoryComponents: ExamFormComponent[] = (formOptions?.components ?? []).filter((component) => component.category === current?.category);
  const freeComponents = categoryComponents.filter((component) => !taken.has(component.id) || component.id === ownComponent);
  const componentId = current && freeComponents.some((component) => component.id === current.component_id) ? current.component_id : (freeComponents[0]?.id ?? "");
  const component = categoryComponents.find((item) => item.id === componentId);
  // General titles follow the component until typed over.
  const name = current ? (!british && !nameTouched && component ? component.name : current.name) : "";

  const change = (patch: Partial<FormState>) => {
    if (!current) return;
    setForm({ ...current, ...patch });
    setErrors((existing) => {
      const next = { ...existing };
      for (const key of Object.keys(patch)) delete next[key as keyof FormState];
      delete next.form;
      return next;
    });
  };

  const setCategory = (category: ExamKind) => {
    // British: the report type follows the category until chosen (CA / Half-Term -> Progress, Exam -> Full).
    change(variantTouched ? { category, component_id: "" } : { category, component_id: "", report_variant: category === "ca" ? "progress" : "full" });
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!current) return next;
    if (!current.term_id) next.term_id = k("errors.termRequired");
    if (!current.class_id) next.class_id = k("errors.classRequired");
    if (!british && !componentId) next.component_id = k("errors.componentRequired");
    if (!name.trim()) next.name = k("errors.nameRequired");
    if (current.start_date && current.end_date && current.end_date < current.start_date) next.end_date = k("errors.endBeforeStart");
    if (current.duration_hours.trim()) {
      const hours = Number(current.duration_hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) next.duration_hours = k("errors.duration");
    }
    return next;
  };

  const toInput = (state: FormState): ExamInput => ({
    category: state.category,
    academic_year_id: state.academic_year_id,
    term_id: state.term_id,
    class_id: state.class_id,
    name: name.trim(),
    result_title: state.result_title.trim() || null,
    start_date: state.start_date || null,
    end_date: state.end_date || null,
    duration_hours: state.duration_hours.trim() ? Number(state.duration_hours) : null,
    report_date: state.report_date || null,
    report_variant: british ? state.report_variant : null,
    component_ids: british ? null : [componentId],
    show_grade_book: british ? state.show_grade_book : true,
    show_va: british ? state.show_va : true,
  });

  /** A failed save: "field: message" lands on that field; anything else is a form-level message. */
  const showFailure = (result: CrudResult<unknown>) => {
    const message = result.ok ? null : (failureMessage(result, t) ?? k("errors.saveFailed"));
    const match = message?.match(/^([a-z_]+): (.+)$/);
    const field = match ? (FIELD_OF[match[1]] ?? (match[1] as keyof FormState)) : null;
    setErrors(field && match ? { [field]: match[2] } : { form: message ?? k("errors.saveFailed") });
  };

  const refresh = () => void queryClient.invalidateQueries({ queryKey: examQueryKeys.all });

  const saveMutation = useMutation({
    mutationFn: (input: ExamInput) => (saved ? updateExam(saved.id, input) : createExam(input)),
    onSuccess: (result) => {
      if (!result.ok) {
        showFailure(result);
        return;
      }
      const wasNew = !saved;
      setSaved(result.data);
      setForm(formFromExam(result.data));
      setNameTouched(true);
      setVariantTouched(true);
      refresh();
      showToast(wasNew ? k("toast.createdDraft", { name: result.data.name }) : k("toast.saved", { name: result.data.name }));
      setStep(2);
    },
    onError: () => setErrors({ form: k("errors.saveFailed") }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => completeExam(id),
    onSuccess: (result) => {
      if (!result.ok) {
        showToast(failureMessage(result, t) ?? k("errors.saveFailed"), "error");
        return;
      }
      refresh();
      showToast(k("toast.completed", { name: result.data.name }));
      onClose();
    },
    onError: () => showToast(k("errors.saveFailed"), "error"),
  });

  const submitStep1 = () => {
    if (!current) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    saveMutation.mutate(toInput(current));
  };

  const busy = saveMutation.isPending || completeMutation.isPending;
  const title = exam ? k("titleEdit", { name: exam.name }) : k("titleCreate");

  return (
    <WideModal
      isOpen
      onClose={onClose}
      title={title}
      subtitle={k("subtitle")}
      footer={
        <>
          <div>
            {step === 2 ? (
              <Button type="button" variant="secondary" onClick={() => setStep(1)} disabled={busy} className="px-4 text-sm">
                {k("back")}
              </Button>
            ) : null}
          </div>
          {step === 1 ? (
            <Button type="button" onClick={submitStep1} disabled={busy || !current} className="px-4 text-sm">
              {saveMutation.isPending ? t("common.saving") : k("saveContinue")}
            </Button>
          ) : (
            <Button type="button" onClick={() => saved && completeMutation.mutate(saved.id)} disabled={busy || !saved} className="px-4 text-sm">
              {completeMutation.isPending ? t("common.saving") : k("complete")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-6">
        <Stepper step={step} labels={[k("steps.details"), k("steps.schedule")]} />

        {!current ? (
          <p className="text-sm text-text-muted">{optionsQuery.isPending ? k("loading") : (failureMessage(optionsQuery.data, t) ?? k("errors.loadFailed"))}</p>
        ) : step === 1 ? (
          <>
            {errors.form ? (
              <p role="alert" className="rounded-md border border-error bg-surface px-3 py-2 text-sm text-error">
                {errors.form}
              </p>
            ) : null}

            <Section title={k("sections.basic")} subtitle={k("sections.basicHelp")}>
              <fieldset className="flex flex-col gap-2" disabled={locked}>
                <legend className="mb-2 text-sm font-medium text-text-primary">{k("fields.category")}</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(["exam", "ca"] as const).map((category) => (
                    <CategoryTile key={category} selected={current.category === category} disabled={locked} onSelect={() => setCategory(category)}>
                      {t(`exam.list.category.${category}`)}
                    </CategoryTile>
                  ))}
                </div>
                {locked ? <p className="text-xs text-text-muted">{k("lockedHelp")}</p> : null}
              </fieldset>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SelectField
                  id="exam-wizard-session"
                  label={k("fields.session")}
                  value={current.academic_year_id}
                  disabled={locked}
                  onChange={(event) => change({ academic_year_id: event.target.value, term_id: "", class_id: "", component_id: "" })}
                >
                  {(options?.years ?? []).map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="exam-wizard-term"
                  label={k("fields.term")}
                  value={current.term_id}
                  disabled={locked}
                  hasError={!!errors.term_id}
                  error={errors.term_id}
                  onChange={(event) => change({ term_id: event.target.value, component_id: "" })}
                >
                  <option value="">{k("fields.termPlaceholder")}</option>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="exam-wizard-class"
                  label={k("fields.class")}
                  value={current.class_id}
                  disabled={locked}
                  hasError={!!errors.class_id}
                  error={errors.class_id}
                  onChange={(event) => change({ class_id: event.target.value, component_id: "" })}
                >
                  <option value="">{k("fields.classPlaceholder")}</option>
                  {(options?.classes ?? []).map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </SelectField>
                {british ? (
                  <SelectField
                    id="exam-wizard-report-type"
                    label={k("fields.reportType")}
                    value={current.report_variant}
                    hasError={!!errors.report_variant}
                    error={errors.report_variant}
                    onChange={(event) => {
                      setVariantTouched(true);
                      change({ report_variant: event.target.value as ReportVariant });
                    }}
                  >
                    <option value="progress">{k("reportType.progress")}</option>
                    <option value="full">{k("reportType.full")}</option>
                  </SelectField>
                ) : (
                  <SelectField
                    id="exam-wizard-component"
                    label={k("fields.component")}
                    value={componentId}
                    disabled={locked || freeComponents.length === 0}
                    hasError={!!errors.component_id}
                    error={errors.component_id}
                    onChange={(event) => change({ component_id: event.target.value })}
                  >
                    {freeComponents.length === 0 ? <option value="">{k("fields.componentNone")}</option> : null}
                    {freeComponents.map((item) => (
                      <option key={item.id} value={item.id}>
                        {k("fields.componentOption", { name: item.name, max: item.max })}
                      </option>
                    ))}
                  </SelectField>
                )}
              </div>
              {!british && current.class_id && formOptions && freeComponents.length === 0 ? (
                <p className="text-xs text-text-muted">{k("componentsTaken", { category: t(`exam.list.category.${current.category}`) })}</p>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <InputField
                  id="exam-wizard-name"
                  label={k("fields.name")}
                  placeholder={k("fields.namePlaceholder")}
                  value={name}
                  maxLength={NAME_MAX}
                  hasError={!!errors.name}
                  error={errors.name}
                  onChange={(event) => {
                    setNameTouched(true);
                    change({ name: event.target.value });
                  }}
                />
                <p className="text-xs text-text-muted">{k("fields.nameHelp")}</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <InputField
                  id="exam-wizard-result-title"
                  label={k("fields.resultTitle")}
                  placeholder={k("fields.resultTitlePlaceholder")}
                  value={current.result_title}
                  maxLength={RESULT_TITLE_MAX}
                  hasError={!!errors.result_title}
                  error={errors.result_title}
                  onChange={(event) => change({ result_title: event.target.value })}
                />
                <p className="text-xs text-text-muted">{k("fields.resultTitleHelp")}</p>
              </div>
            </Section>

            <Section title={k("sections.details")} subtitle={k("sections.detailsHelp")}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InputField
                  id="exam-wizard-start"
                  type="date"
                  label={k("fields.startDate")}
                  value={current.start_date}
                  hasError={!!errors.start_date}
                  error={errors.start_date}
                  onChange={(event) => change({ start_date: event.target.value })}
                />
                <InputField
                  id="exam-wizard-end"
                  type="date"
                  label={k("fields.endDate")}
                  value={current.end_date}
                  hasError={!!errors.end_date}
                  error={errors.end_date}
                  onChange={(event) => change({ end_date: event.target.value })}
                />
                <InputField
                  id="exam-wizard-duration"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={24}
                  step={0.5}
                  label={k("fields.duration")}
                  placeholder="0"
                  value={current.duration_hours}
                  hasError={!!errors.duration_hours}
                  error={errors.duration_hours}
                  onChange={(event) => change({ duration_hours: event.target.value })}
                />
                <div className="flex flex-col gap-1.5">
                  <InputField
                    id="exam-wizard-report-date"
                    type="date"
                    label={k("fields.reportDate")}
                    value={current.report_date}
                    hasError={!!errors.report_date}
                    error={errors.report_date}
                    onChange={(event) => change({ report_date: event.target.value })}
                  />
                  <p className="text-xs text-text-muted">{k("fields.reportDateHelp")}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <FlagCheckbox
                    id="exam-wizard-gradebook"
                    label={k("fields.gradebook")}
                    checked={british ? current.show_grade_book : true}
                    disabled={!british}
                    onChange={(checked) => change({ show_grade_book: checked })}
                  />
                  <FlagCheckbox
                    id="exam-wizard-tracking"
                    label={k("fields.tracking")}
                    checked={british ? current.show_va : true}
                    disabled={!british}
                    onChange={(checked) => change({ show_va: checked })}
                  />
                </div>
                <p className="text-xs text-text-muted">{british ? k("fields.flagsHelp") : k("fields.flagsBritishOnly")}</p>
              </div>
            </Section>
          </>
        ) : (
          <Section title={k("sections.schedule")} subtitle={k("sections.scheduleHelp")}>
            {saved ? (
              <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Summary label={k("fields.name")} value={saved.name} />
                <Summary label={k("fields.class")} value={options?.classes.find((cls) => cls.id === saved.class_id)?.name ?? "—"} />
                <Summary label={k("fields.term")} value={terms.find((term) => term.id === saved.term_id)?.name ?? "—"} />
                <Summary label={k("summary.dates")} value={saved.start_date ? `${saved.start_date} – ${saved.end_date ?? "…"}` : k("summary.noDates")} />
                <Summary label={k("summary.status")} value={t(`exam.list.status.${saved.status}`)} />
              </dl>
            ) : null}
            <p className="text-sm text-text-secondary">{saved?.status === "active" ? k("scheduleActive") : k("scheduleDraft")}</p>
          </Section>
        )}
      </div>
    </WideModal>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-background p-4">{children}</div>
    </section>
  );
}

function CategoryTile({ selected, disabled, onSelect, children }: { selected: boolean; disabled: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex h-16 items-center justify-center rounded-lg border text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed ${
        selected ? "border-accent bg-brand-tint text-accent" : "border-border bg-surface text-text-secondary hover:text-text-primary"
      } ${disabled && !selected ? "opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function FlagCheckbox({ id, label, checked, disabled, onChange }: { id: string; label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label htmlFor={id} className={`inline-flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed text-text-muted opacity-60" : "text-text-primary"}`}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-accent disabled:cursor-not-allowed" />
      {label}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="font-medium text-text-primary">{value}</dd>
    </div>
  );
}

/** Two-step header: Details, Schedule. */
function Stepper({ step, labels }: { step: 1 | 2; labels: [string, string] }) {
  return (
    <ol className="flex items-center gap-3">
      {labels.map((label, index) => {
        const number = (index + 1) as 1 | 2;
        const done = number < step;
        const active = number === step;
        return (
          <li key={label} className="flex items-center gap-3">
            {index > 0 ? <span aria-hidden className={`h-px w-8 sm:w-16 ${done || active ? "bg-status-done" : "bg-status-empty-border"}`} /> : null}
            <span className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  done ? "bg-status-done text-white" : active ? "bg-accent text-on-accent" : "border-2 border-status-empty-border text-text-muted"
                }`}
              >
                {done ? <CheckIcon className="h-4 w-4" /> : number}
              </span>
              <span className={`text-xs sm:text-sm ${active ? "font-semibold text-text-primary" : "text-text-muted"}`}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import {
  componentContribution,
  STRUCTURE_TOTAL,
  structureTotal,
  subfieldRollup,
  type BreakdownMode,
  type ComponentCategory,
} from "@/lib/setup/assessmentConfiguration/assessmentStructure";
import {
  emptyComponent,
  emptySubfield,
  parseNumber,
  toStructureInput,
  type ComponentForm,
  type StructureForm,
  type SubfieldForm,
} from "@/components/setup/assessmentConfiguration/assessmentStructureForm";

type BuilderProps = {
  data: StructureForm;
  onChange: (patch: Partial<StructureForm>) => void;
  errors: Record<string, string>;
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string; badge?: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-md border border-border bg-background p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              selected ? "bg-surface font-medium text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {option.label}
            {option.badge ? (
              <span className="rounded-full bg-category-amber-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function NumberCell({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error || undefined}
        className={`h-10 w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
          error ? "border-error" : "border-border"
        }`}
      />
    </div>
  );
}

function TextCell({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error || undefined}
        className={`h-10 w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent ${
          error ? "border-error" : "border-border"
        }`}
      />
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "hover:text-error" : "hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function TotalPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        ok ? "bg-category-green-tint text-success" : "bg-category-amber-tint text-warning"
      }`}
    >
      {children}
    </span>
  );
}

function FieldErrors({ messages }: { messages: Array<string | undefined> }) {
  const shown = messages.filter((message): message is string => !!message);
  if (shown.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {shown.map((message, index) => (
        <li key={index} className="text-xs text-error">
          {message}
        </li>
      ))}
    </ul>
  );
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Display a derived number: integers as-is, otherwise up to 2 decimals. */
function fmt(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "—";
}

// ---------------------------------------------------------------------------
// Sub-field row
// ---------------------------------------------------------------------------

function SubfieldRow({
  sub,
  index,
  count,
  breakdown,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  sub: SubfieldForm;
  index: number;
  count: number;
  breakdown: BreakdownMode;
  errors: Record<string, string>;
  onChange: (patch: Partial<SubfieldForm>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("setup.assessmentTypes");
  const weighted = breakdown === "weighted";
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background p-2.5">
      <div className="flex items-end gap-2">
        <div className={`grid min-w-0 flex-1 gap-2 ${weighted ? "grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"}`}>
          <TextCell
            id={`${sub.key}-name`}
            label={t("fields.subfield.name")}
            placeholder={t("fields.subfield.namePlaceholder")}
            value={sub.name}
            onChange={(name) => onChange({ name })}
            error={errors[`${sub.key}.name`]}
          />
          <NumberCell
            id={`${sub.key}-max`}
            label={t("fields.subfield.max")}
            value={sub.max}
            onChange={(max) => onChange({ max })}
            error={errors[`${sub.key}.max`]}
          />
          {weighted ? (
            <NumberCell
              id={`${sub.key}-weight`}
              label={t("fields.subfield.weight")}
              value={sub.weight}
              onChange={(weight) => onChange({ weight })}
              error={errors[`${sub.key}.weight`]}
            />
          ) : null}
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton label={t("actions.moveUp")} onClick={() => onMove(index - 1)} disabled={index === 0}>
            <ArrowRightIcon className="h-4 w-4 -rotate-90" />
          </IconButton>
          <IconButton label={t("actions.moveDown")} onClick={() => onMove(index + 1)} disabled={index === count - 1}>
            <ArrowRightIcon className="h-4 w-4 rotate-90" />
          </IconButton>
          <IconButton label={t("actions.removeSubfield")} onClick={onRemove} danger>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <FieldErrors messages={[errors[`${sub.key}.name`], errors[`${sub.key}.max`], errors[`${sub.key}.weight`]]} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component card
// ---------------------------------------------------------------------------

function ComponentCard({
  component,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  component: ComponentForm;
  index: number;
  count: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<ComponentForm>) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("setup.assessmentTypes");
  const max = parseNumber(component.max);
  const weightText = component.weight.trim();
  const weight = weightText ? Number(weightText) : null;
  const contribution = componentContribution({ max, weight });
  const hasBreakdown = component.breakdown !== "none";
  const rollup = subfieldRollup({
    max,
    weight,
    breakdown: component.breakdown,
    subfields: component.subfields.map((sub) => ({
      max: parseNumber(sub.max),
      weight: sub.weight.trim() ? Number(sub.weight.trim()) : null,
    })),
  });

  const setSubfields = (subfields: SubfieldForm[]) => onChange({ subfields });
  const toggleBreakdown = (on: boolean) => {
    if (!on) {
      onChange({ breakdown: "none" });
      return;
    }
    // Turning a breakdown on starts with two empty rows (the minimum) — or
    // restores the rows that were there before it was switched off.
    onChange({
      breakdown: "sum",
      subfields: component.subfields.length > 0 ? component.subfields : [emptySubfield(), emptySubfield()],
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("fields.component.heading", { number: index + 1 })}
        </span>
        <div className="flex items-center">
          <IconButton label={t("actions.moveUp")} onClick={() => onMove(index - 1)} disabled={index === 0}>
            <ArrowRightIcon className="h-4 w-4 -rotate-90" />
          </IconButton>
          <IconButton label={t("actions.moveDown")} onClick={() => onMove(index + 1)} disabled={index === count - 1}>
            <ArrowRightIcon className="h-4 w-4 rotate-90" />
          </IconButton>
          <IconButton label={t("actions.removeComponent")} onClick={onRemove} danger>
            <CloseIcon className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,2fr)_auto]">
        <TextCell
          id={`${component.key}-name`}
          label={t("fields.component.name")}
          placeholder={t("fields.component.namePlaceholder")}
          value={component.name}
          onChange={(name) => onChange({ name })}
          error={errors[`${component.key}.name`]}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-text-secondary">{t("fields.component.category")}</span>
          <Segmented<ComponentCategory>
            label={t("fields.component.category")}
            options={[
              { value: "ca", label: t("categories.ca") },
              { value: "exam", label: t("categories.exam") },
            ]}
            value={component.category}
            onChange={(category) => onChange({ category })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberCell
          id={`${component.key}-max`}
          label={t("fields.component.max")}
          value={component.max}
          onChange={(value) => onChange({ max: value })}
          error={errors[`${component.key}.max`]}
        />
        <NumberCell
          id={`${component.key}-weight`}
          label={t("fields.component.weight")}
          placeholder={t("fields.component.weightPlaceholder")}
          value={component.weight}
          onChange={(value) => onChange({ weight: value })}
          error={errors[`${component.key}.weight`]}
        />
      </div>

      <p className="text-xs text-text-secondary">
        {weight !== null
          ? t("summary.scaled", { max: fmt(max), weight: fmt(contribution), total: STRUCTURE_TOTAL })
          : t("summary.contributes", { value: fmt(contribution), total: STRUCTURE_TOTAL })}
      </p>

      <FieldErrors
        messages={[errors[`${component.key}.name`], errors[`${component.key}.max`], errors[`${component.key}.weight`]]}
      />

      <Toggle
        id={`${component.key}-breakdown`}
        label={t("fields.breakdown.label")}
        helper={t("fields.breakdown.helper")}
        checked={hasBreakdown}
        onChange={toggleBreakdown}
      />

      {hasBreakdown ? (
        <div className="flex flex-col gap-2.5 border-l-2 border-brand-tint pl-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented<BreakdownMode>
              label={t("fields.breakdown.rollup")}
              options={[
                { value: "sum", label: t("breakdown.sum") },
                { value: "weighted", label: t("breakdown.weighted") },
              ]}
              value={component.breakdown}
              onChange={(breakdown) => onChange({ breakdown })}
            />
            {rollup ? (
              <TotalPill ok={Number.isFinite(rollup.target) && rollup.actual === Math.round(rollup.target * 100) / 100}>
                {component.breakdown === "sum"
                  ? t("summary.subSum", { actual: fmt(rollup.actual), target: fmt(rollup.target) })
                  : t("summary.subWeight", { actual: fmt(rollup.actual), target: fmt(rollup.target) })}
              </TotalPill>
            ) : null}
          </div>
          <p className="text-xs text-text-muted">
            {component.breakdown === "sum" ? t("breakdown.sumHelp") : t("breakdown.weightedHelp")}
          </p>

          {component.subfields.map((sub, si) => (
            <SubfieldRow
              key={sub.key}
              sub={sub}
              index={si}
              count={component.subfields.length}
              breakdown={component.breakdown}
              errors={errors}
              onChange={(patch) =>
                setSubfields(component.subfields.map((item) => (item.key === sub.key ? { ...item, ...patch } : item)))
              }
              onMove={(to) => setSubfields(move(component.subfields, si, to))}
              onRemove={() => setSubfields(component.subfields.filter((item) => item.key !== sub.key))}
            />
          ))}

          <FieldErrors messages={[errors[`${component.key}.subfields`]]} />

          <button
            type="button"
            onClick={() => setSubfields([...component.subfields, emptySubfield()])}
            className="flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-sm font-medium text-accent hover:bg-brand-tint"
          >
            <PlusIcon className="h-4 w-4" />
            {t("actions.addSubfield")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Assessment-structure builder (renders inside CrudScreen's slide-over).
 * Every total shown is derived live from the form — nothing is stored.
 * Field-level errors appear after a save attempt (CrudScreen runs
 * validateStructure first and blocks the save); the totals pills are
 * always live.
 */
export function AssessmentStructureBuilder({ data, onChange, errors }: BuilderProps) {
  const t = useTranslations("setup.assessmentTypes");
  const errorCount = Object.keys(errors).length;
  const total = structureTotal(
    toStructureInput(data).components.map((component) => ({ max: component.max, weight: component.weight })),
  );

  const setComponents = (components: ComponentForm[]) => onChange({ components });

  return (
    <div className="flex flex-col gap-5">
      {errorCount > 0 ? (
        <div role="alert" className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">
          {t("errors.fixBeforeSave")}
        </div>
      ) : null}

      <InputField
        id="assessment-structure-name"
        label={t("fields.name.label")}
        placeholder={t("fields.name.placeholder")}
        value={data.name}
        onChange={(event) => onChange({ name: event.target.value })}
        hasError={!!errors.name}
        error={errors.name}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-primary">{t("fields.mode.label")}</span>
        <Segmented
          label={t("fields.mode.label")}
          options={[
            { value: "component_based", label: t("modes.component_based") },
            { value: "grade_based", label: t("modes.grade_based"), badge: t("modes.comingNext") },
          ]}
          value={data.mode}
          onChange={(mode) => onChange({ mode })}
        />
        <p className="text-xs text-text-muted">{t(`modeHelp.${data.mode}`)}</p>
      </div>

      {data.mode === "grade_based" ? (
        <div role="status" className="rounded-md border border-border bg-category-amber-tint px-4 py-3 text-sm text-text-primary">
          <p className="font-medium">{t("gradeBasedStub.title")}</p>
          <p className="mt-1 text-text-secondary">{t("gradeBasedStub.body")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium text-text-primary">{t("fields.components.label")}</span>
            <TotalPill ok={total === STRUCTURE_TOTAL}>
              {t("summary.total", { actual: fmt(total), target: STRUCTURE_TOTAL })}
            </TotalPill>
          </div>
          <p className="text-xs text-text-muted">{t("fields.components.helper", { total: STRUCTURE_TOTAL })}</p>

          {data.components.map((component, ci) => (
            <ComponentCard
              key={component.key}
              component={component}
              index={ci}
              count={data.components.length}
              errors={errors}
              onChange={(patch) =>
                setComponents(data.components.map((item) => (item.key === component.key ? { ...item, ...patch } : item)))
              }
              onMove={(to) => setComponents(move(data.components, ci, to))}
              onRemove={() => setComponents(data.components.filter((item) => item.key !== component.key))}
            />
          ))}

          <FieldErrors messages={[errors.components]} />

          <button
            type="button"
            onClick={() => setComponents([...data.components, emptyComponent()])}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2.5 text-sm font-medium text-accent hover:bg-brand-tint"
          >
            <PlusIcon className="h-4 w-4" />
            {t("actions.addComponent")}
          </button>
        </div>
      )}

      <Toggle
        id="assessment-structure-active"
        label={t("fields.isActive.label")}
        helper={t("fields.isActive.helper")}
        checked={data.is_active}
        onChange={(is_active) => onChange({ is_active })}
      />
      <Toggle
        id="assessment-structure-default"
        label={t("fields.isDefault.label")}
        helper={t("fields.isDefault.helper")}
        checked={data.is_default}
        onChange={(is_default) => onChange({ is_default })}
      />
      <FieldErrors messages={[errors.is_default, errors.mode]} />
    </div>
  );
}

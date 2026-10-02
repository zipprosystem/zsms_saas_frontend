"use client";

import { useTranslations } from "next-intl";

export type ElectivePillOption = { id: string; name: string; enrolled: boolean };

type StudentSubjectPillsProps = {
  coreNames: string[];
  electives: ElectivePillOption[];
  onToggleElective: (classSubjectId: string) => void;
  disabled?: boolean;
};

/**
 * Shared "one student's subject list" renderer — core subjects shown
 * locked/greyed (CORE AUTO-INHERIT is derive-at-read, never user-editable
 * here, see subjectEnrolmentApi.ts), electives shown as click-to-toggle
 * pills. Used by both the Per Class details table (one row per student)
 * and the Per Student details view (one student, larger) — same visual
 * language either place.
 */
export function StudentSubjectPills({ coreNames, electives, onToggleElective, disabled }: StudentSubjectPillsProps) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {coreNames.map((name) => (
        <span
          key={name}
          title={t("setup.subjectEnrolment.corePillTitle")}
          className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-text-muted"
        >
          {name}
        </span>
      ))}
      {electives.map((subject) => (
        <button
          key={subject.id}
          type="button"
          disabled={disabled}
          onClick={() => onToggleElective(subject.id)}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            subject.enrolled
              ? "bg-accent text-white hover:bg-accent/90"
              : "border border-dashed border-border text-text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {subject.name}
        </button>
      ))}
    </div>
  );
}

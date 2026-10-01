"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PlusIcon } from "@/components/icons/PlusIcon";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { FileAttachmentField } from "@/components/files/FileAttachmentField";
import { validateFile } from "@/lib/files/fileValidation";
import type { PastRecordEntryForm, PastRecordsForm } from "@/components/students/wizard/studentFormTypes";

const ATTACHMENT_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
const ATTACHMENT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

function newLocalId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random()}`;
}

const EMPTY_RECORD: Omit<PastRecordEntryForm, "localId"> = {
  school: "",
  class: "",
  grade: "",
  rank: "",
  year: "",
  attachment: null,
};

/** Entirely optional, repeatable — "+ Add" blocks for a student's past school history. */
export function PastRecordsStep({
  data,
  onChange,
}: {
  data: PastRecordsForm;
  onChange: (patch: Partial<PastRecordsForm>) => void;
}) {
  const t = useTranslations();

  const addRecord = () => {
    onChange({ records: [...data.records, { localId: newLocalId(), ...EMPTY_RECORD }] });
  };
  const removeRecord = (localId: string) => {
    onChange({ records: data.records.filter((record) => record.localId !== localId) });
  };
  const updateRecord = (localId: string, patch: Partial<PastRecordEntryForm>) => {
    onChange({ records: data.records.map((record) => (record.localId === localId ? { ...record, ...patch } : record)) });
  };

  return (
    <div className="flex flex-col gap-5">
      {data.records.length === 0 ? (
        <p className="text-sm text-text-muted">{t("students.wizard.fields.pastRecords.empty")}</p>
      ) : null}

      {data.records.map((record, index) => (
        <div key={record.localId} className="flex flex-col gap-4 rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-text-primary">
              {t("students.wizard.fields.pastRecords.entryTitle", { number: index + 1 })}
            </p>
            <button
              type="button"
              onClick={() => removeRecord(record.localId)}
              className="flex items-center gap-1 text-sm font-semibold text-error hover:underline"
            >
              <CloseIcon className="h-3.5 w-3.5" />
              {t("common.delete")}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              id={`wizard-past-record-school-${record.localId}`}
              label={t("students.wizard.fields.pastRecords.school")}
              value={record.school}
              onChange={(event) => updateRecord(record.localId, { school: event.target.value })}
            />
            <InputField
              id={`wizard-past-record-class-${record.localId}`}
              label={t("students.wizard.fields.pastRecords.class")}
              value={record.class}
              onChange={(event) => updateRecord(record.localId, { class: event.target.value })}
            />
            <InputField
              id={`wizard-past-record-grade-${record.localId}`}
              label={t("students.wizard.fields.pastRecords.grade")}
              value={record.grade}
              onChange={(event) => updateRecord(record.localId, { grade: event.target.value })}
            />
            <InputField
              id={`wizard-past-record-rank-${record.localId}`}
              label={t("students.wizard.fields.pastRecords.rank")}
              value={record.rank}
              onChange={(event) => updateRecord(record.localId, { rank: event.target.value })}
            />
            <InputField
              id={`wizard-past-record-year-${record.localId}`}
              label={t("students.wizard.fields.pastRecords.year")}
              value={record.year}
              onChange={(event) => updateRecord(record.localId, { year: event.target.value })}
            />
          </div>

          <FileAttachmentField
            label={t("students.wizard.fields.pastRecords.attachment")}
            chooseLabel={t("students.wizard.fields.pastRecords.chooseAttachment")}
            accept=".pdf,.jpg,.jpeg,.png"
            purpose="past_record_attachment"
            validate={(file) => validateFile(file, { allowedTypes: ATTACHMENT_ALLOWED_TYPES, maxSizeBytes: ATTACHMENT_MAX_SIZE_BYTES })}
            validationMessages={{
              unsupportedType: t("students.wizard.fields.pastRecords.errors.unsupportedType"),
              tooLarge: t("students.wizard.fields.pastRecords.errors.tooLarge"),
            }}
            value={record.attachment}
            onChange={(attachment) => updateRecord(record.localId, { attachment })}
          />
        </div>
      ))}

      <Button type="button" variant="secondary" onClick={addRecord} icon={<PlusIcon className="h-4 w-4" />} className="w-full sm:w-auto">
        {t("students.wizard.fields.pastRecords.add")}
      </Button>
    </div>
  );
}

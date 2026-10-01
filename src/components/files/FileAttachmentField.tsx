"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { uploadFile, type AttachedFile, type FileUploadPurpose } from "@/lib/files/filesApi";
import { formatFileSize, type FileValidation } from "@/lib/files/fileValidation";

/**
 * Optional single-file attachment field — used by Past Records (Step 7)
 * for its per-entry document. Validates client-side, "uploads" (mock, see
 * filesApi.ts) immediately, and hands the parent an AttachedFile. No
 * download link — the mock has no real download endpoint to link to; the
 * attached file's name is shown as plain text.
 */
export function FileAttachmentField({
  label,
  chooseLabel,
  accept,
  validate,
  validationMessages,
  value,
  onChange,
  chooseIcon,
  purpose,
}: {
  label: string;
  chooseLabel: string;
  accept: string;
  validate: (file: File) => FileValidation;
  validationMessages: { unsupportedType: string; tooLarge: string };
  value: AttachedFile | null;
  onChange: (file: AttachedFile | null) => void;
  chooseIcon?: ReactNode;
  purpose: FileUploadPurpose;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validate(file);
    if (!validation.ok) {
      setError(validationMessages[validation.reason]);
      return;
    }

    setError(null);
    setIsUploading(true);
    const uploaded = await uploadFile(file, purpose);
    setIsUploading(false);
    onChange(uploaded);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="block max-w-full truncate text-sm font-semibold text-text-primary">{value.name}</p>
            <p className="text-xs text-text-muted">{formatFileSize(value.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-sm font-semibold text-error hover:underline"
          >
            {t("common.delete")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="flex h-12 items-center justify-center gap-2 rounded-md border border-dashed border-border text-sm font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
        >
          {chooseIcon}
          {isUploading ? t("files.uploading") : chooseLabel}
        </button>
      )}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFileSelect} />
      {error ? <p className="text-sm text-error">{error}</p> : null}
    </div>
  );
}

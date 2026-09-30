"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { FileDownloadLink } from "@/components/files/FileDownloadLink";
import { uploadFile, type AttachedFile } from "@/lib/files/filesApi";
import { formatFileSize, type FileValidation } from "@/lib/files/fileValidation";

/**
 * Optional single-file attachment field, shared by Subject Master and
 * Class Subjects. Validates client-side, uploads immediately via
 * filesApi.uploadFile(), and hands the parent an AttachedFile (whose
 * file_id is what the entity saves). The attached file's name is a
 * FileDownloadLink — the signed URL is fetched on click.
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
}: {
  label: string;
  chooseLabel: string;
  accept: string;
  validate: (file: File) => FileValidation;
  validationMessages: { unsupportedType: string; tooLarge: string };
  value: AttachedFile | null;
  onChange: (file: AttachedFile | null) => void;
  chooseIcon?: ReactNode;
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
    const result = await uploadFile(file);
    setIsUploading(false);

    if (result.ok) {
      onChange(result.data);
      return;
    }
    setError(
      result.kind === "devBypassUnavailable"
        ? t("setup.crudScreen.errors.devBypassUnavailable")
        : ("message" in result && result.message) || t("files.uploadFailed"),
    );
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {value ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <FileDownloadLink
              fileId={value.file_id}
              className="block max-w-full truncate text-sm font-semibold text-accent hover:underline"
            >
              {value.name ?? t("files.attachedFile")}
            </FileDownloadLink>
            {value.size !== null ? <p className="text-xs text-text-muted">{formatFileSize(value.size)}</p> : null}
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

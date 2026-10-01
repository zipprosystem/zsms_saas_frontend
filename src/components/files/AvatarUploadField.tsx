"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { uploadFile, type AttachedFile } from "@/lib/files/filesApi";
import type { FileValidation } from "@/lib/files/fileValidation";

/**
 * Circular-preview variant of FileAttachmentField, for Student Details'
 * passport photo — a row-style attachment card doesn't fit the "small
 * square photo" look the design calls for.
 *
 * Uses the real uploadFile() (filesApi.ts) like every other attachment
 * field — its AttachedFile has no local-preview field (the real API has no
 * equivalent; a saved photo's preview would come from a signed
 * download-url fetch instead, same as FileDownloadLink). The circular
 * preview immediately after picking a file is generated here instead, via
 * a plain browser object URL kept in local state — independent of the
 * upload's own result — and revoked on replace/unmount so it doesn't leak.
 */
export function AvatarUploadField({
  label,
  validate,
  validationMessages,
  value,
  onChange,
}: {
  label: string;
  validate: (file: File) => FileValidation;
  validationMessages: { unsupportedType: string; tooLarge: string };
  value: AttachedFile | null;
  onChange: (file: AttachedFile | null) => void;
}) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke on replace (new object URL set) and on unmount — object URLs
  // otherwise hold their Blob in memory for the page's lifetime.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });

    setIsUploading(true);
    const result = await uploadFile(file, "student_photo");
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

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-background text-text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
        >
          {value && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object URL for the just-picked file, not an optimizable remote asset
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UploadIcon className="h-6 w-6" />
          )}
        </button>
        <div className="flex flex-col gap-1">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="text-sm font-semibold text-accent hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              {isUploading ? t("files.uploading") : value ? t("files.change") : t("files.choosePhoto")}
            </button>
            {value ? (
              <button
                type="button"
                onClick={handleRemove}
                className="flex items-center gap-1 text-sm font-semibold text-error hover:underline"
              >
                <CloseIcon className="h-3.5 w-3.5" />
                {t("common.delete")}
              </button>
            ) : null}
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}

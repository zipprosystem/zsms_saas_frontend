"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "@/components/icons/CloseIcon";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { validateFile } from "@/lib/files/fileValidation";
import {
  REPORT_LOGO_ALLOWED_TYPES,
  REPORT_LOGO_MAX_SIZE_BYTES,
  uploadReportLogo,
  useReportLogoUrl,
} from "@/lib/setup/academicStructure/schoolTypeAssignments";

/**
 * School Type's report logo — same pick → validate → upload-at-once →
 * store-the-file-id flow as AvatarUploadField, with a square
 * object-contain preview (logos aren't cropped to a circle). Uploads via
 * uploadReportLogo(), which is the MOCK local store until
 * SCHOOL_TYPE_ASSIGNMENTS_LIVE flips.
 */
export function ReportLogoUploadField({
  value,
  onChange,
  error,
}: {
  value: string | null;
  onChange: (fileId: string | null) => void;
  /** The form's own error (e.g. "required"); upload/validation errors are kept locally. */
  error?: string;
}) {
  const t = useTranslations();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedUrl = useReportLogoUrl(previewUrl ? null : value);
  const imageUrl = value ? (previewUrl ?? savedUrl) : null;

  // Object URLs hold their Blob until revoked — revoke on replace and unmount.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validation = validateFile(file, { allowedTypes: REPORT_LOGO_ALLOWED_TYPES, maxSizeBytes: REPORT_LOGO_MAX_SIZE_BYTES });
    if (!validation.ok) {
      setUploadError(t(`setup.schoolTypes.fields.reportLogo.errors.${validation.reason}`));
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    const result = await uploadReportLogo(file);
    setIsUploading(false);

    if (!result.ok) {
      setUploadError(
        result.kind === "devBypassUnavailable"
          ? t("setup.crudScreen.errors.devBypassUnavailable")
          : ("message" in result && result.message) || t("files.uploadFailed"),
      );
      return;
    }
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    onChange(result.data.file_id);
  };

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onChange(null);
  };

  const shownError = uploadError ?? error;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-primary">{t("setup.schoolTypes.fields.reportLogo.label")}</span>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          aria-label={t("setup.schoolTypes.fields.reportLogo.choose")}
          className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed bg-background text-text-muted transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60 ${
            shownError ? "border-error" : "border-border"
          }`}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local object/data URL or short-lived signed URL, not an optimizable static asset
            <img src={imageUrl} alt="" className="h-full w-full object-contain p-1" />
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
              {isUploading
                ? t("files.uploading")
                : value
                  ? t("files.change")
                  : t("setup.schoolTypes.fields.reportLogo.choose")}
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
          <p className="text-xs text-text-muted">{t("setup.schoolTypes.fields.reportLogo.hint")}</p>
          {shownError ? <p className="text-sm text-error">{shownError}</p> : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={REPORT_LOGO_ALLOWED_TYPES.join(",")}
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}

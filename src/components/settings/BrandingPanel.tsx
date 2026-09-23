"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { Button } from "@/components/ui/Button";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { validateLogoFile, readFileAsBase64 } from "@/lib/settings/logoUpload";
import { getSchoolSettings, uploadSchoolLogo } from "@/lib/settings/settingsApi";
import type { SettingsData } from "@/lib/settings/types";

type BrandingPanelProps = {
  isOpen: boolean;
  section: SettingsData["branding"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

/**
 * Unlike every other settings panel, Branding has no diffed "Save" —
 * School Logo uploads immediately to its own endpoint (POST
 * school/settings/logo, not PATCH school/settings) the moment a valid file
 * is picked, and the other 3 slots have no save action at all (deferred,
 * display-only). So the footer is just "Close", and each slot manages its
 * own state independently.
 */
export function BrandingPanel({ isOpen, section, onClose, onSaved }: BrandingPanelProps) {
  const t = useTranslations();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleSchoolLogoSelected = async (file: File) => {
    setUploadError(null);

    const validation = validateLogoFile(file);
    if (!validation.ok) {
      setUploadError(
        t(
          validation.reason === "unsupportedType"
            ? "settings.brandingPanel.errors.unsupportedType"
            : "settings.brandingPanel.errors.tooLarge",
        ),
      );
      return;
    }

    setIsUploading(true);
    const contentBase64 = await readFileAsBase64(file);
    const result = await uploadSchoolLogo({
      content_base64: contentBase64,
      mime_type: file.type,
      filename: file.name,
    });

    if (!result.ok) {
      setIsUploading(false);
      switch (result.kind) {
        case "tooLarge":
          setUploadError(t("settings.brandingPanel.errors.tooLarge"));
          break;
        case "unsupportedType":
          setUploadError(t("settings.brandingPanel.errors.unsupportedType"));
          break;
        case "forbidden":
          setUploadError(t("settings.brandingPanel.errors.forbidden"));
          break;
        case "devBypassUnavailable":
          setUploadError(t("settings.errors.devBypassUnavailable"));
          break;
        default:
          setUploadError(t("settings.brandingPanel.errors.uploadFailed"));
      }
      return;
    }

    // Per Muntajir: refetch the full settings after a successful upload
    // rather than merging { logo_url, profile_version } in by hand.
    const refreshed = await getSchoolSettings();
    setIsUploading(false);

    if (refreshed.ok) {
      onSaved(refreshed.data);
      return;
    }

    // The upload itself succeeded — don't lose that. Keep the panel open
    // and say so, rather than silently failing or pretending nothing changed.
    setUploadError(t("settings.brandingPanel.errors.uploadedButRefreshFailed"));
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.brandingPanel.title")}
      subtitle={t("settings.brandingPanel.subtitle")}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {uploadError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{uploadError}</div>
        ) : null}

        <LogoSlot
          label={t("settings.brandingPanel.schoolLogo.label")}
          helper={t("settings.brandingPanel.schoolLogo.helper")}
          url={section.school_logo_url}
          functional
          isUploading={isUploading}
          changeLabel={isUploading ? t("settings.brandingPanel.uploading") : t("settings.brandingPanel.changeFile")}
          onFileSelected={handleSchoolLogoSelected}
        />

        {/* Deferred — display-only, no upload path yet. Mapped to their
            contract fields as-is; the favicon/mobile/loader semantics
            reconcile with Muntajir once these become functional. */}
        <LogoSlot
          label={t("settings.brandingPanel.mobileLogo.label")}
          helper={t("settings.brandingPanel.mobileLogo.helper")}
          url={section.mobile_logo_url}
          functional={false}
          changeLabel={t("settings.brandingPanel.comingSoon")}
        />

        <LogoSlot
          label={t("settings.brandingPanel.principalSignature.label")}
          helper={t("settings.brandingPanel.principalSignature.helper")}
          url={section.principal_signature_url}
          functional={false}
          changeLabel={t("settings.brandingPanel.comingSoon")}
        />

        <LogoSlot
          label={t("settings.brandingPanel.portalLoader.label")}
          helper={t("settings.brandingPanel.portalLoader.helper")}
          url={section.portal_loader_url}
          functional={false}
          changeLabel={t("settings.brandingPanel.comingSoon")}
        />
      </div>
    </SlideOverPanel>
  );
}

type LogoSlotProps = {
  label: string;
  helper: string;
  url: string | null;
  functional: boolean;
  isUploading?: boolean;
  changeLabel: string;
  onFileSelected?: (file: File) => void;
};

function LogoSlot({
  label,
  helper,
  url,
  functional,
  isUploading,
  changeLabel,
  onFileSelected,
}: LogoSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
    if (file) onFileSelected?.(file);
  };

  return (
    <div className="flex items-start gap-4">
      <Thumbnail url={url} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-text-primary">{label}</span>
        {functional ? (
          <>
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className="w-fit text-sm font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline"
            >
              {changeLabel}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleChange}
            />
          </>
        ) : (
          <span className="w-fit text-sm font-semibold text-text-muted">{changeLabel}</span>
        )}
        <p className="text-xs text-text-muted">{helper}</p>
      </div>
    </div>
  );
}

function Thumbnail({ url }: { url: string | null }): ReactNode {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UploadIcon className="h-6 w-6 text-text-muted" />
      )}
    </div>
  );
}

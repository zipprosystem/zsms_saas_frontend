"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { isPlausibleUrl } from "@/lib/settings/validation";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type SocialMediaUpdate = NonNullable<SettingsUpdate["social_media"]>;

type FormState = {
  facebook: string;
  instagram: string;
  youtube: string;
  twitter: string;
};

function toFormState(section: SettingsData["social_media"]): FormState {
  return {
    facebook: section.facebook ?? "",
    instagram: section.instagram ?? "",
    youtube: section.youtube ?? "",
    twitter: section.twitter ?? "",
  };
}

function buildUpdate(original: FormState, form: FormState): SocialMediaUpdate {
  const update: SocialMediaUpdate = {};

  const facebook = form.facebook.trim();
  if (facebook !== original.facebook.trim()) update.facebook = facebook || null;

  const instagram = form.instagram.trim();
  if (instagram !== original.instagram.trim()) update.instagram = instagram || null;

  const youtube = form.youtube.trim();
  if (youtube !== original.youtube.trim()) update.youtube = youtube || null;

  const twitter = form.twitter.trim();
  if (twitter !== original.twitter.trim()) update.twitter = twitter || null;

  return update;
}

type SocialMediaPanelProps = {
  isOpen: boolean;
  section: SettingsData["social_media"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function SocialMediaPanel({ isOpen, section, onClose, onSaved }: SocialMediaPanelProps) {
  const t = useTranslations();
  const [original, setOriginal] = useState<FormState>(() => toFormState(section));
  const [form, setForm] = useState<FormState>(() => toFormState(section));
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const state = toFormState(section);
      setOriginal(state);
      setForm(state);
      setTouched({});
      setGeneralError(null);
      setIsSaving(false);
    }
  }, [isOpen, section]);

  const fieldValid = (value: string) => !value.trim() || isPlausibleUrl(value.trim());
  const isValid =
    fieldValid(form.facebook) &&
    fieldValid(form.instagram) &&
    fieldValid(form.youtube) &&
    fieldValid(form.twitter);

  const errorFor = (field: keyof FormState) =>
    touched[field] && !fieldValid(form[field])
      ? t("settings.socialMediaPanel.errors.invalidUrl")
      : undefined;

  const handleSave = async () => {
    setTouched({ facebook: true, instagram: true, youtube: true, twitter: true });
    setGeneralError(null);
    if (!isValid) return;

    const update = buildUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ social_media: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.socialMediaPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.socialMediaPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.socialMediaPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.socialMediaPanel.title")}
      subtitle={t("settings.socialMediaPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <InputField
          id="edit-social-facebook"
          type="url"
          label={t("settings.socialMediaPanel.facebook.label")}
          placeholder={t("settings.socialMediaPanel.urlPlaceholder")}
          value={form.facebook}
          onChange={(event) => setForm((current) => ({ ...current, facebook: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, facebook: true }))}
          hasError={!!errorFor("facebook")}
          error={errorFor("facebook")}
        />

        <InputField
          id="edit-social-instagram"
          type="url"
          label={t("settings.socialMediaPanel.instagram.label")}
          placeholder={t("settings.socialMediaPanel.urlPlaceholder")}
          value={form.instagram}
          onChange={(event) => setForm((current) => ({ ...current, instagram: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, instagram: true }))}
          hasError={!!errorFor("instagram")}
          error={errorFor("instagram")}
        />

        <InputField
          id="edit-social-youtube"
          type="url"
          label={t("settings.socialMediaPanel.youtube.label")}
          placeholder={t("settings.socialMediaPanel.urlPlaceholder")}
          value={form.youtube}
          onChange={(event) => setForm((current) => ({ ...current, youtube: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, youtube: true }))}
          hasError={!!errorFor("youtube")}
          error={errorFor("youtube")}
        />

        <InputField
          id="edit-social-twitter"
          type="url"
          label={t("settings.socialMediaPanel.twitter.label")}
          placeholder={t("settings.socialMediaPanel.urlPlaceholder")}
          value={form.twitter}
          onChange={(event) => setForm((current) => ({ ...current, twitter: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, twitter: true }))}
          hasError={!!errorFor("twitter")}
          error={errorFor("twitter")}
        />
      </div>
    </SlideOverPanel>
  );
}

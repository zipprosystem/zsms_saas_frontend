"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { IdentityUpdate, SettingsData } from "@/lib/settings/types";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Maps the contract's identity.* field names back to this form's own error
// keys, for routing a 422's errors[].field to the right input. Assumption,
// flagged: the backend's errors[].field values match identity.* one-to-one
// (same assumption already made for onboarding's 422 mapping).
const CONTRACT_FIELD_TO_FORM_FIELD: Record<string, keyof IdentityFormState> = {
  school_name: "schoolName",
  email: "email",
  phone: "phone",
  website: "website",
  uin: "uin",
  client_name: "clientName",
  show_website_to_visitors: "showWebsiteToVisitors",
};

function isPlausibleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

type IdentityFormState = {
  schoolName: string;
  email: string;
  phone: string;
  website: string;
  uin: string;
  clientName: string;
  showWebsiteToVisitors: boolean;
};

function toFormState(identity: SettingsData["identity"]): IdentityFormState {
  return {
    schoolName: identity.school_name,
    email: identity.email,
    phone: identity.phone,
    website: identity.website ?? "",
    uin: identity.uin ?? "",
    clientName: identity.client_name ?? "",
    showWebsiteToVisitors: identity.show_website_to_visitors,
  };
}

// True partial diff — only the fields that actually changed from what the
// panel opened with go into the PATCH body. `undefined` for the rest, which
// omitEmpty-style callers (here, buildIdentityUpdate itself) drop entirely.
function buildIdentityUpdate(
  original: IdentityFormState,
  form: IdentityFormState,
): IdentityUpdate {
  const update: IdentityUpdate = {};

  const schoolName = form.schoolName.trim();
  if (schoolName !== original.schoolName.trim()) update.school_name = schoolName;

  const email = form.email.trim();
  if (email !== original.email.trim()) update.email = email;

  const phone = form.phone.trim();
  if (phone !== original.phone.trim()) update.phone = phone;

  const website = form.website.trim();
  if (website !== original.website.trim()) update.website = website || null;

  const uin = form.uin.trim();
  if (uin !== original.uin.trim()) update.uin = uin || null;

  const clientName = form.clientName.trim();
  if (clientName !== original.clientName.trim()) update.client_name = clientName || null;

  if (form.showWebsiteToVisitors !== original.showWebsiteToVisitors) {
    update.show_website_to_visitors = form.showWebsiteToVisitors;
  }

  return update;
}

type EditSchoolIdentityPanelProps = {
  isOpen: boolean;
  identity: SettingsData["identity"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function EditSchoolIdentityPanel({
  isOpen,
  identity,
  onClose,
  onSaved,
}: EditSchoolIdentityPanelProps) {
  const t = useTranslations();
  const [original, setOriginal] = useState<IdentityFormState>(() => toFormState(identity));
  const [form, setForm] = useState<IdentityFormState>(() => toFormState(identity));
  const [touched, setTouched] = useState<Partial<Record<keyof IdentityFormState, boolean>>>({});
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof IdentityFormState, string>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const state = toFormState(identity);
      setOriginal(state);
      setForm(state);
      setTouched({});
      setFieldErrors({});
      setGeneralError(null);
      setIsSaving(false);
    }
  }, [isOpen, identity]);

  const schoolNameValid = form.schoolName.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(form.email.trim());
  const websiteValid = !form.website.trim() || isPlausibleUrl(form.website.trim());
  const isValid = schoolNameValid && emailValid && websiteValid;

  const handleSave = async () => {
    setTouched({ schoolName: true, email: true, website: true });
    setGeneralError(null);
    if (!isValid) return;

    const update = buildIdentityUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ identity: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation": {
        const errors: Partial<Record<keyof IdentityFormState, string>> = {};
        for (const error of result.errors) {
          const formField = CONTRACT_FIELD_TO_FORM_FIELD[error.field];
          if (formField) errors[formField] = t("settings.identityPanel.errors.fieldInvalid");
        }
        setFieldErrors(errors);
        setGeneralError(t("settings.identityPanel.errors.submitField"));
        break;
      }
      case "forbidden":
        setGeneralError(t("settings.identityPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.identityPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.identityPanel.title")}
      subtitle={t("settings.identityPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <InputField
          id="edit-identity-school-name"
          label={t("settings.identityPanel.schoolName.label")}
          placeholder={t("settings.identityPanel.schoolName.placeholder")}
          value={form.schoolName}
          onChange={(event) => setForm((current) => ({ ...current, schoolName: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, schoolName: true }))}
          hasError={(touched.schoolName && !schoolNameValid) || !!fieldErrors.schoolName}
          error={
            touched.schoolName && !schoolNameValid
              ? t("settings.identityPanel.errors.required")
              : fieldErrors.schoolName
          }
        />

        <div className="flex flex-col gap-1.5">
          <InputField
            id="edit-identity-subdomain"
            label={t("settings.identityPanel.subdomain.label")}
            value={`${identity.slug}.zsmsapp.com`}
            disabled
            readOnly
          />
          <p className="text-xs text-text-muted">{t("settings.identityPanel.subdomain.helper")}</p>
        </div>

        <InputField
          id="edit-identity-email"
          type="email"
          label={t("settings.identityPanel.email.label")}
          placeholder={t("settings.identityPanel.email.placeholder")}
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          hasError={(touched.email && !emailValid) || !!fieldErrors.email}
          error={
            touched.email && !emailValid
              ? t("settings.identityPanel.errors.invalidEmail")
              : fieldErrors.email
          }
        />

        <InputField
          id="edit-identity-phone"
          type="tel"
          label={t("settings.identityPanel.phone.label")}
          placeholder={t("settings.identityPanel.phone.placeholder")}
          value={form.phone}
          onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          hasError={!!fieldErrors.phone}
          error={fieldErrors.phone}
        />

        <InputField
          id="edit-identity-website"
          type="url"
          label={t("settings.identityPanel.website.label")}
          placeholder={t("settings.identityPanel.website.placeholder")}
          value={form.website}
          onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, website: true }))}
          hasError={(touched.website && !websiteValid) || !!fieldErrors.website}
          error={
            touched.website && !websiteValid
              ? t("settings.identityPanel.errors.invalidUrl")
              : fieldErrors.website
          }
        />

        <InputField
          id="edit-identity-uin"
          label={t("settings.identityPanel.uin.label")}
          placeholder={t("settings.identityPanel.uin.placeholder")}
          value={form.uin}
          onChange={(event) => setForm((current) => ({ ...current, uin: event.target.value }))}
          hasError={!!fieldErrors.uin}
          error={fieldErrors.uin}
        />

        <InputField
          id="edit-identity-client-name"
          label={t("settings.identityPanel.clientName.label")}
          placeholder={t("settings.identityPanel.clientName.placeholder")}
          value={form.clientName}
          onChange={(event) => setForm((current) => ({ ...current, clientName: event.target.value }))}
          hasError={!!fieldErrors.clientName}
          error={fieldErrors.clientName}
        />

        <Toggle
          id="edit-identity-show-website"
          label={t("settings.identityPanel.showWebsite.label")}
          helper={t("settings.identityPanel.showWebsite.helper")}
          checked={form.showWebsiteToVisitors}
          onChange={(showWebsiteToVisitors) =>
            setForm((current) => ({ ...current, showWebsiteToVisitors }))
          }
        />
      </div>
    </SlideOverPanel>
  );
}

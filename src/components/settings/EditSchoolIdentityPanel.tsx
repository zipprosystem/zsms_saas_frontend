"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { PhoneField } from "@/components/onboarding/PhoneField";
import { useCountries } from "@/lib/onboarding/location/hooks";
import { updateSchoolIdentity, type SchoolSettings } from "@/lib/settings/schoolSettings";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type IdentityFormState = {
  schoolName: string;
  customDomain: string;
  email: string;
  phoneDialCode: string;
  phoneNumber: string;
  showWebsiteToVisitors: boolean;
};

function toFormState(identity: SchoolSettings["identity"]): IdentityFormState {
  return {
    schoolName: identity.schoolName,
    customDomain: identity.customDomain,
    email: identity.email,
    phoneDialCode: identity.phoneDialCode,
    phoneNumber: identity.phoneNumber,
    showWebsiteToVisitors: identity.showWebsiteToVisitors,
  };
}

type EditSchoolIdentityPanelProps = {
  isOpen: boolean;
  identity: SchoolSettings["identity"];
  onClose: () => void;
  onSaved: (identity: SchoolSettings["identity"]) => void;
};

export function EditSchoolIdentityPanel({
  isOpen,
  identity,
  onClose,
  onSaved,
}: EditSchoolIdentityPanelProps) {
  const t = useTranslations();
  const { countries } = useCountries();
  const [form, setForm] = useState<IdentityFormState>(() => toFormState(identity));
  const [touched, setTouched] = useState<{ schoolName?: boolean; email?: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(toFormState(identity));
      setTouched({});
      setIsSaving(false);
    }
  }, [isOpen, identity]);

  const schoolNameValid = form.schoolName.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(form.email.trim());
  const isValid = schoolNameValid && emailValid;

  const handleSave = async () => {
    setTouched({ schoolName: true, email: true });
    if (!isValid) return;

    setIsSaving(true);
    const updated = await updateSchoolIdentity({
      schoolName: form.schoolName.trim(),
      customDomain: form.customDomain.trim(),
      email: form.email.trim(),
      phoneDialCode: form.phoneDialCode,
      phoneNumber: form.phoneNumber.trim(),
      showWebsiteToVisitors: form.showWebsiteToVisitors,
    });
    setIsSaving(false);
    onSaved(updated);
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
        <InputField
          id="edit-identity-school-name"
          label={t("settings.identityPanel.schoolName.label")}
          placeholder={t("settings.identityPanel.schoolName.placeholder")}
          value={form.schoolName}
          onChange={(event) => setForm((current) => ({ ...current, schoolName: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, schoolName: true }))}
          hasError={touched.schoolName && !schoolNameValid}
          error={touched.schoolName && !schoolNameValid ? t("settings.identityPanel.errors.required") : undefined}
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

        <div className="flex flex-col gap-1.5">
          <InputField
            id="edit-identity-custom-domain"
            label={t("settings.identityPanel.customDomain.label")}
            placeholder={t("settings.identityPanel.customDomain.placeholder")}
            value={form.customDomain}
            onChange={(event) =>
              setForm((current) => ({ ...current, customDomain: event.target.value }))
            }
          />
          <p className="text-xs text-text-muted">{t("settings.identityPanel.customDomain.helper")}</p>
        </div>

        <InputField
          id="edit-identity-email"
          type="email"
          label={t("settings.identityPanel.email.label")}
          placeholder={t("settings.identityPanel.email.placeholder")}
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          onBlur={() => setTouched((current) => ({ ...current, email: true }))}
          hasError={touched.email && !emailValid}
          error={touched.email && !emailValid ? t("settings.identityPanel.errors.invalidEmail") : undefined}
        />

        <PhoneField
          id="edit-identity-phone"
          label={t("settings.identityPanel.phone.label")}
          placeholder={t("settings.identityPanel.phone.placeholder")}
          dialCode={form.phoneDialCode}
          number={form.phoneNumber}
          countries={countries}
          onDialCodeChange={(value) => setForm((current) => ({ ...current, phoneDialCode: value }))}
          onNumberChange={(value) => setForm((current) => ({ ...current, phoneNumber: value }))}
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

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { EmailListField } from "@/components/ui/EmailListField";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { sameStringSet } from "@/lib/settings/arrayDiff";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type NotificationRoutingUpdate = NonNullable<SettingsUpdate["notification_routing"]>;

type FormState = {
  financeAlertEmails: string[];
  disciplinaryAlertEmails: string[];
};

function toFormState(section: SettingsData["notification_routing"]): FormState {
  return {
    financeAlertEmails: section.finance_alert_emails,
    disciplinaryAlertEmails: section.disciplinary_alert_emails,
  };
}

function buildUpdate(original: FormState, form: FormState): NotificationRoutingUpdate {
  const update: NotificationRoutingUpdate = {};

  if (!sameStringSet(form.financeAlertEmails, original.financeAlertEmails)) {
    update.finance_alert_emails = form.financeAlertEmails;
  }

  if (!sameStringSet(form.disciplinaryAlertEmails, original.disciplinaryAlertEmails)) {
    update.disciplinary_alert_emails = form.disciplinaryAlertEmails;
  }

  return update;
}

type NotificationRoutingPanelProps = {
  isOpen: boolean;
  section: SettingsData["notification_routing"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function NotificationRoutingPanel({
  isOpen,
  section,
  onClose,
  onSaved,
}: NotificationRoutingPanelProps) {
  const t = useTranslations();
  const [original, setOriginal] = useState<FormState>(() => toFormState(section));
  const [form, setForm] = useState<FormState>(() => toFormState(section));
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const state = toFormState(section);
      setOriginal(state);
      setForm(state);
      setGeneralError(null);
      setIsSaving(false);
    }
  }, [isOpen, section]);

  const handleSave = async () => {
    setGeneralError(null);

    const update = buildUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ notification_routing: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.notificationRoutingPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.notificationRoutingPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.notificationRoutingPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.notificationRoutingPanel.title")}
      subtitle={t("settings.notificationRoutingPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <EmailListField
          label={t("settings.notificationRoutingPanel.financeAlertEmails.label")}
          value={form.financeAlertEmails}
          onChange={(financeAlertEmails) => setForm((current) => ({ ...current, financeAlertEmails }))}
          addLabel={t("settings.notificationRoutingPanel.addEmail")}
          addPlaceholder={t("settings.notificationRoutingPanel.emailPlaceholder")}
          invalidEmailError={t("settings.notificationRoutingPanel.errors.invalidEmail")}
        />

        <EmailListField
          label={t("settings.notificationRoutingPanel.disciplinaryAlertEmails.label")}
          value={form.disciplinaryAlertEmails}
          onChange={(disciplinaryAlertEmails) =>
            setForm((current) => ({ ...current, disciplinaryAlertEmails }))
          }
          addLabel={t("settings.notificationRoutingPanel.addEmail")}
          addPlaceholder={t("settings.notificationRoutingPanel.emailPlaceholder")}
          invalidEmailError={t("settings.notificationRoutingPanel.errors.invalidEmail")}
        />
      </div>
    </SlideOverPanel>
  );
}

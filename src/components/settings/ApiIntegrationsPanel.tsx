"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { ApiIntegrationsUpdate, SettingsData } from "@/lib/settings/types";

/**
 * SECRET HANDLING (api_key, client_secret) — the one non-obvious part of
 * this panel:
 *
 * api_key/client_secret come back from GET already masked by the backend
 * (e.g. "••••••1234"), never the real value. Seeding an editable input from
 * that mask would risk sending the mask itself back as the "new" secret and
 * overwriting the real one — so these two inputs are NEVER seeded from
 * `section`. They always start empty ("").
 *
 * That alone can't distinguish "user left this blank" (leave unchanged)
 * from "user typed then deleted a new value" (explicitly clear it) — both
 * look like "" by value. So each gets its own `*Edited` flag, flipped to
 * true the instant onChange fires on that field at all, independent of the
 * resulting value:
 *   - not edited                -> field omitted from the PATCH entirely (unchanged server-side)
 *   - edited, non-empty value   -> send that plaintext value (a real new secret)
 *   - edited, empty value       -> send null (explicit clear)
 *
 * The masked current value is shown as static read-only text next to each
 * input for context only — never bound to the input, never part of the diff.
 */

type FormState = {
  apiKey: string;
  apiKeyEdited: boolean;
  smsSenderName: string;
  clientId: string;
  clientSecret: string;
  clientSecretEdited: boolean;
};

function toFormState(section: SettingsData["api_integrations"]): FormState {
  return {
    apiKey: "",
    apiKeyEdited: false,
    smsSenderName: section.sms_sender_name ?? "",
    clientId: section.client_id ?? "",
    clientSecret: "",
    clientSecretEdited: false,
  };
}

function buildUpdate(original: FormState, form: FormState): ApiIntegrationsUpdate {
  const update: ApiIntegrationsUpdate = {};

  if (form.apiKeyEdited) {
    update.api_key = form.apiKey.trim() || null;
  }

  const smsSenderName = form.smsSenderName.trim();
  if (smsSenderName !== original.smsSenderName.trim()) update.sms_sender_name = smsSenderName || null;

  const clientId = form.clientId.trim();
  if (clientId !== original.clientId.trim()) update.client_id = clientId || null;

  if (form.clientSecretEdited) {
    update.client_secret = form.clientSecret.trim() || null;
  }

  // configured is never part of FormState or this update — see
  // ApiIntegrationsUpdate's Pick in types.ts, which excludes it structurally.

  return update;
}

type ApiIntegrationsPanelProps = {
  isOpen: boolean;
  section: SettingsData["api_integrations"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function ApiIntegrationsPanel({
  isOpen,
  section,
  onClose,
  onSaved,
}: ApiIntegrationsPanelProps) {
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
    const result = await updateSchoolSettings({ api_integrations: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.apiIntegrationsPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.apiIntegrationsPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.apiIntegrationsPanel.errors.submitFailed"));
    }
  };

  const currentApiKey = section.api_key ?? t("settings.notSet");
  const currentClientSecret = section.client_secret ?? t("settings.notSet");

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.apiIntegrationsPanel.title")}
      subtitle={t("settings.apiIntegrationsPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <InputField
            id="edit-api-key"
            type="password"
            label={t("settings.apiIntegrationsPanel.apiKey.label")}
            placeholder={t("settings.apiIntegrationsPanel.secretPlaceholder")}
            value={form.apiKey}
            onChange={(event) =>
              setForm((current) => ({ ...current, apiKey: event.target.value, apiKeyEdited: true }))
            }
          />
          <p className="text-xs text-text-muted">
            {t("settings.apiIntegrationsPanel.currentValue", { value: currentApiKey })}
          </p>
        </div>

        <InputField
          id="edit-api-sms-sender-name"
          label={t("settings.apiIntegrationsPanel.smsSenderName.label")}
          value={form.smsSenderName}
          onChange={(event) => setForm((current) => ({ ...current, smsSenderName: event.target.value }))}
        />

        <InputField
          id="edit-api-client-id"
          label={t("settings.apiIntegrationsPanel.clientId.label")}
          value={form.clientId}
          onChange={(event) => setForm((current) => ({ ...current, clientId: event.target.value }))}
        />

        <div className="flex flex-col gap-1.5">
          <InputField
            id="edit-api-client-secret"
            type="password"
            label={t("settings.apiIntegrationsPanel.clientSecret.label")}
            placeholder={t("settings.apiIntegrationsPanel.secretPlaceholder")}
            value={form.clientSecret}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                clientSecret: event.target.value,
                clientSecretEdited: true,
              }))
            }
          />
          <p className="text-xs text-text-muted">
            {t("settings.apiIntegrationsPanel.currentValue", { value: currentClientSecret })}
          </p>
        </div>
      </div>
    </SlideOverPanel>
  );
}

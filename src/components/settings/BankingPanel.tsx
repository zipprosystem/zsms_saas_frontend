"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type BankingUpdate = NonNullable<SettingsUpdate["banking"]>;

type FormState = {
  bankName: string;
  accountNumber: string;
  accountName: string;
  branch: string;
};

function toFormState(section: SettingsData["banking"]): FormState {
  return {
    bankName: section.bank_name ?? "",
    accountNumber: section.account_number ?? "",
    accountName: section.account_name ?? "",
    branch: section.branch ?? "",
  };
}

function buildUpdate(original: FormState, form: FormState): BankingUpdate {
  const update: BankingUpdate = {};

  const bankName = form.bankName.trim();
  if (bankName !== original.bankName.trim()) update.bank_name = bankName || null;

  const accountNumber = form.accountNumber.trim();
  if (accountNumber !== original.accountNumber.trim()) update.account_number = accountNumber || null;

  const accountName = form.accountName.trim();
  if (accountName !== original.accountName.trim()) update.account_name = accountName || null;

  const branch = form.branch.trim();
  if (branch !== original.branch.trim()) update.branch = branch || null;

  return update;
}

type BankingPanelProps = {
  isOpen: boolean;
  section: SettingsData["banking"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function BankingPanel({ isOpen, section, onClose, onSaved }: BankingPanelProps) {
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
    const result = await updateSchoolSettings({ banking: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.bankingPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.bankingPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.bankingPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.bankingPanel.title")}
      subtitle={t("settings.bankingPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <InputField
          id="edit-banking-bank-name"
          label={t("settings.bankingPanel.bankName.label")}
          value={form.bankName}
          onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value }))}
        />

        <InputField
          id="edit-banking-account-number"
          label={t("settings.bankingPanel.accountNumber.label")}
          value={form.accountNumber}
          onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
        />

        <InputField
          id="edit-banking-account-name"
          label={t("settings.bankingPanel.accountName.label")}
          value={form.accountName}
          onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))}
        />

        <InputField
          id="edit-banking-branch"
          label={t("settings.bankingPanel.branch.label")}
          value={form.branch}
          onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))}
        />
      </div>
    </SlideOverPanel>
  );
}

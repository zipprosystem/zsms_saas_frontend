"use client";

import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/icons/CheckIcon";

type SuccessScreenProps = {
  ownerEmail: string;
  requestReference: string;
};

export function SuccessScreen({ ownerEmail, requestReference }: SuccessScreenProps) {
  const t = useTranslations();

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-status-done text-white">
        <CheckIcon className="h-8 w-8" />
      </span>
      <h1 className="mt-6 font-display text-2xl font-medium text-text-primary sm:text-3xl">
        {t("onboarding.success.heading")}
      </h1>
      <p className="mt-3 max-w-md text-sm text-text-secondary">
        {t("onboarding.success.message", { email: ownerEmail })}
      </p>
      <div className="mt-6 flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface px-5 py-3">
        <span className="block text-xs text-text-muted">{t("onboarding.success.referenceLabel")}</span>
        <span className="block text-sm font-semibold text-accent">{requestReference}</span>
      </div>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { useToast } from "@/components/ui/Toast";
import { SettingsCard, SettingsField } from "@/components/settings/SettingsCard";
import { EditSchoolIdentityPanel } from "@/components/settings/EditSchoolIdentityPanel";
import { ComingSoonPanel } from "@/components/settings/ComingSoonPanel";
import { getSchoolSettings, type SchoolSettings } from "@/lib/settings/schoolSettings";
import type { TenantStatus } from "@/types/tenant";

type SettingsTab = "general" | "schoolSetup";

const EDITABLE_SECTIONS = [
  "identity",
  "branding",
  "generalBehaviour",
  "regional",
  "banking",
  "questionBank",
  "socialMedia",
  "apiIntegrations",
  "notificationRouting",
] as const;

type EditableSection = (typeof EDITABLE_SECTIONS)[number];

function isEditableSection(value: string | null): value is EditableSection {
  return !!value && (EDITABLE_SECTIONS as readonly string[]).includes(value);
}

function maskSecret(value: string): string {
  if (!value) return "—";
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(8)}${value.slice(-4)}`;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsShell />}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsShell() {
  const t = useTranslations();
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-text-muted">{t("onboarding.common.loading")}</p>
    </div>
  );
}

function SettingsContent() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [tab, setTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [editingSection, setEditingSection] = useState<EditableSection | null>(null);

  useEffect(() => {
    getSchoolSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const edit = searchParams.get("edit");
    if (isEditableSection(edit)) {
      setEditingSection(edit);
    }
    // Only meant to run once, off the URL present at mount — the deep link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeEditPanel = () => {
    setEditingSection(null);
    if (searchParams.get("edit")) {
      router.replace("/admin/settings", { scroll: false });
    }
  };

  if (!settings) {
    return <SettingsShell />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 border-b border-border">
        <TabButton active={tab === "general"} onClick={() => setTab("general")}>
          {t("settings.tabs.general")}
        </TabButton>
        <TabButton active={tab === "schoolSetup"} onClick={() => setTab("schoolSetup")}>
          {t("settings.tabs.schoolSetup")}
        </TabButton>
      </div>

      {tab === "schoolSetup" ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-text-muted">{t("settings.schoolSetupComingSoon")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <SettingsCard
            title={t("settings.sections.identity.title")}
            editLabel={t("settings.editProfile")}
            onEdit={() => setEditingSection("identity")}
          >
            <div className="flex flex-wrap items-center gap-4">
              <IdentityLogo schoolName={settings.identity.schoolName} logoUrl={settings.identity.logoUrl} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold text-text-primary">
                    {settings.identity.schoolName}
                  </span>
                  <StatusBadge status={settings.identity.status} />
                </div>
                <span className="text-sm text-text-secondary">
                  {settings.identity.slug}.zsmsapp.com
                </span>
                <span className="text-sm text-text-secondary">
                  {settings.identity.email} · +{settings.identity.phoneDialCode}{" "}
                  {settings.identity.phoneNumber}
                </span>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.branding.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("branding")}
          >
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <BrandingSlot
                label={t("settings.sections.branding.schoolLogo")}
                url={settings.branding.schoolLogoUrl}
              />
              <BrandingSlot
                label={t("settings.sections.branding.mobileLogo")}
                url={settings.branding.mobileLogoUrl}
              />
              <BrandingSlot
                label={t("settings.sections.branding.principalSignature")}
                url={settings.branding.principalSignatureUrl}
              />
              <BrandingSlot
                label={t("settings.sections.branding.portalLoader")}
                url={settings.branding.portalLoaderUrl}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.generalBehaviour.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("generalBehaviour")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SettingsField
                label={t("settings.sections.generalBehaviour.workingDays")}
                value={settings.generalBehaviour.workingDays
                  .map((day) => t(`onboarding.options.workingDays.${day}`))
                  .join(", ")}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.recordsPerPage")}
                value={settings.generalBehaviour.recordsPerPage}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.dateFormat")}
                value={settings.generalBehaviour.dateFormat}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.timeFormat")}
                value={settings.generalBehaviour.timeFormat}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.absenceEndDelay")}
                value={t("settings.sections.generalBehaviour.absenceEndDelayValue", {
                  days: settings.generalBehaviour.absenceEndDelayDays,
                })}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.notificationChannel")}
                value={settings.generalBehaviour.notificationChannel}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.studentIdPrefix")}
                value={settings.generalBehaviour.studentIdPrefix}
              />
              <SettingsField
                label={t("settings.sections.generalBehaviour.staffIdPrefix")}
                value={settings.generalBehaviour.staffIdPrefix}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.regional.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("regional")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SettingsField label={t("settings.sections.regional.address")} value={settings.regional.address} />
              <SettingsField label={t("settings.sections.regional.country")} value={settings.regional.country} />
              <SettingsField label={t("settings.sections.regional.timezone")} value={settings.regional.timezone} />
              <SettingsField label={t("settings.sections.regional.currency")} value={settings.regional.currency} />
              <SettingsField label={t("settings.sections.regional.pax")} value={settings.regional.pax} />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.banking.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("banking")}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SettingsField label={t("settings.sections.banking.bankName")} value={settings.banking.bankName} />
              <SettingsField
                label={t("settings.sections.banking.accountNumber")}
                value={maskSecret(settings.banking.accountNumber)}
              />
              <SettingsField label={t("settings.sections.banking.accountName")} value={settings.banking.accountName} />
              <SettingsField label={t("settings.sections.banking.branch")} value={settings.banking.branch} />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.questionBank.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("questionBank")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label={t("settings.sections.questionBank.questionsPerPage")}
                value={settings.questionBank.questionsPerPage}
              />
              <SettingsField
                label={t("settings.sections.questionBank.defaultExamDuration")}
                value={t("settings.sections.questionBank.minutesValue", {
                  minutes: settings.questionBank.defaultExamDurationMinutes,
                })}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.socialMedia.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("socialMedia")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label={t("settings.sections.socialMedia.facebook")}
                value={settings.socialMedia.facebook || t("settings.notSet")}
              />
              <SettingsField
                label={t("settings.sections.socialMedia.instagram")}
                value={settings.socialMedia.instagram || t("settings.notSet")}
              />
              <SettingsField
                label={t("settings.sections.socialMedia.youtube")}
                value={settings.socialMedia.youtube || t("settings.notSet")}
              />
              <SettingsField
                label={t("settings.sections.socialMedia.twitter")}
                value={settings.socialMedia.twitter || t("settings.notSet")}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.apiIntegrations.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("apiIntegrations")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label={t("settings.sections.apiIntegrations.apiKey")}
                value={maskSecret(settings.apiIntegrations.apiKey)}
              />
              <SettingsField
                label={t("settings.sections.apiIntegrations.smsSenderName")}
                value={settings.apiIntegrations.smsSenderName}
              />
              <SettingsField
                label={t("settings.sections.apiIntegrations.clientId")}
                value={settings.apiIntegrations.clientId}
              />
              <SettingsField
                label={t("settings.sections.apiIntegrations.clientSecret")}
                value={maskSecret(settings.apiIntegrations.clientSecret)}
              />
            </div>
          </SettingsCard>

          <SettingsCard
            title={t("settings.sections.notificationRouting.title")}
            editLabel={t("settings.edit")}
            onEdit={() => setEditingSection("notificationRouting")}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsField
                label={t("settings.sections.notificationRouting.financeAlerts")}
                value={settings.notificationRouting.financeAlertEmails.join(", ")}
              />
              <SettingsField
                label={t("settings.sections.notificationRouting.disciplinaryAlerts")}
                value={settings.notificationRouting.disciplinaryAlertEmails.join(", ")}
              />
            </div>
          </SettingsCard>

          <SettingsCard title={t("settings.sections.helpFeedback.title")}>
            <div className="flex flex-wrap gap-6">
              <a
                href={settings.helpFeedback.helpCentreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-accent hover:underline"
              >
                {t("settings.sections.helpFeedback.helpCentre")}
                <span className="sr-only"> ({t("settings.sections.helpFeedback.opensInNewTab")})</span>
              </a>
              <a
                href={settings.helpFeedback.submitFeedbackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-accent hover:underline"
              >
                {t("settings.sections.helpFeedback.submitFeedback")}
                <span className="sr-only"> ({t("settings.sections.helpFeedback.opensInNewTab")})</span>
              </a>
            </div>
          </SettingsCard>
        </div>
      )}

      <EditSchoolIdentityPanel
        isOpen={editingSection === "identity"}
        identity={settings.identity}
        onClose={closeEditPanel}
        onSaved={(identity) => {
          setSettings((current) => (current ? { ...current, identity } : current));
          closeEditPanel();
          showToast(t("settings.toast.identityUpdated"));
        }}
      />

      <ComingSoonPanel
        isOpen={editingSection !== null && editingSection !== "identity"}
        title={
          editingSection && editingSection !== "identity"
            ? t(`settings.sections.${editingSection}.title`)
            : ""
        }
        onClose={closeEditPanel}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative pb-3 text-sm font-semibold transition-colors ${
        active ? "text-accent" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {children}
      {active ? <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" /> : null}
    </button>
  );
}

function StatusBadge({ status }: { status: TenantStatus }) {
  const t = useTranslations();
  const styles: Record<TenantStatus, string> = {
    active: "bg-category-green-tint text-status-done-text",
    suspended: "bg-error/10 text-error",
    pending: "bg-category-amber-tint text-warning",
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {t(`settings.status.${status}`)}
    </span>
  );
}

function IdentityLogo({ schoolName, logoUrl }: { schoolName: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
      </div>
    );
  }

  const initial = schoolName.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-lg font-semibold text-accent"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

function BrandingSlot({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <UploadIcon className="h-6 w-6 text-text-muted" />
        )}
      </div>
      <span className="text-center text-xs text-text-muted">{label}</span>
    </div>
  );
}

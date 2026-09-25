"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadIcon } from "@/components/icons/UploadIcon";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SettingsCard, SettingsField } from "@/components/settings/SettingsCard";
import { EditSchoolIdentityPanel } from "@/components/settings/EditSchoolIdentityPanel";
import { BrandingPanel } from "@/components/settings/BrandingPanel";
import { GeneralBehaviourPanel } from "@/components/settings/GeneralBehaviourPanel";
import { RegionalSettingsPanel } from "@/components/settings/RegionalSettingsPanel";
import { QuestionBankPanel } from "@/components/settings/QuestionBankPanel";
import { NotificationRoutingPanel } from "@/components/settings/NotificationRoutingPanel";
import { BankingPanel } from "@/components/settings/BankingPanel";
import { SocialMediaPanel } from "@/components/settings/SocialMediaPanel";
import { ApiIntegrationsPanel } from "@/components/settings/ApiIntegrationsPanel";
import { ComingSoonPanel } from "@/components/settings/ComingSoonPanel";
import { getSchoolSettings, throwIfTransientSettings, type SettingsResult } from "@/lib/settings/settingsApi";
import { SETTINGS_SECTION_KEYS, type SettingsSectionKey } from "@/lib/settings/settingsSections";
import { STRUCTURAL_STALE_TIME_MS } from "@/lib/queryClient";
import type { SettingsData } from "@/lib/settings/types";
import type { TenantStatus } from "@/types/tenant";

/** Shared by useQuery here and queryClient.setQueryData in every panel's onSaved below — must match exactly. */
const SETTINGS_QUERY_KEY = ["settings"];

// Shared with the global search index (src/lib/search) — see
// settingsSections.ts's own header comment for why this moved out of here.
const EDITABLE_SECTIONS = SETTINGS_SECTION_KEYS;

type EditableSection = SettingsSectionKey;

function isEditableSection(value: string | null): value is EditableSection {
  return !!value && (EDITABLE_SECTIONS as readonly string[]).includes(value);
}

// Sections with a real edit panel wired — everything else in
// EDITABLE_SECTIONS still opens ComingSoonPanel.
const WIRED_SECTIONS = [
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

function hasWiredPanel(section: EditableSection): boolean {
  return (WIRED_SECTIONS as readonly string[]).includes(section);
}

// Widened defensively to string|null|undefined: api_integrations.api_key/
// client_secret aren't documented nullable, but `configured: boolean`
// alongside them strongly suggests they may be absent pre-setup. No
// confirmed case of it yet — this only hardens the function itself against
// that, without changing SettingsData's typed contract.
function maskSecret(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(8)}${value.slice(-4)}`;
}

// Every nullable string field rendered in a read-only card goes through
// this — never rendered raw, and never a fallback blank. `notSetLabel` is
// passed in (rather than calling useTranslations here) since this is a
// plain module-level function, not a component.
function orNotSet(value: string | null, notSetLabel: string): string {
  return value ?? notSetLabel;
}

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; settings: SettingsData }
  | { status: "forbidden" }
  | { status: "devBypassUnavailable" }
  | { status: "error" };

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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => getSchoolSettings().then(throwIfTransientSettings),
    staleTime: STRUCTURAL_STALE_TIME_MS,
  });
  const [editingSection, setEditingSection] = useState<EditableSection | null>(null);

  // Mapped from react-query's own {data, isPending, isError} into the same
  // LoadState shape this screen has always used below — same reasoning as
  // useCrudTable's retrofit (see crudTypes.ts's throwIfTransient).
  const load: LoadState = query.isPending
    ? { status: "loading" }
    : query.isError
      ? { status: "error" } // TransientQueryError, retries already exhausted
      : query.data.ok
        ? { status: "loaded", settings: query.data.data }
        : query.data.kind === "forbidden"
          ? { status: "forbidden" }
          : query.data.kind === "devBypassUnavailable"
            ? { status: "devBypassUnavailable" }
            : { status: "error" }; // "validation" can't happen on a GET

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

  if (load.status === "loading") {
    return <SettingsShell />;
  }

  if (load.status === "forbidden") {
    return <SettingsMessage text={t("settings.errors.forbidden")} />;
  }

  if (load.status === "devBypassUnavailable") {
    return <SettingsMessage text={t("settings.errors.devBypassUnavailable")} />;
  }

  if (load.status === "error") {
    return (
      <SettingsMessage text={t("settings.errors.loadFailed")}>
        <Button type="button" variant="secondary" onClick={() => query.refetch()}>
          {t("common.retry")}
        </Button>
      </SettingsMessage>
    );
  }

  const settings = load.settings;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 border-b border-border">
        <TabButton active>{t("settings.tabs.general")}</TabButton>
        {/* Setup lives as its own area now (sidebar + /admin/setup + the
            checklist all point there) — this tab navigates away rather
            than switching in-page content, since there's nothing left to
            switch to here. */}
        <Link
          href="/admin/setup"
          className="relative pb-3 text-sm font-semibold text-text-muted transition-colors hover:text-text-primary"
        >
          {t("settings.tabs.schoolSetup")}
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <SettingsCard
          title={t("settings.sections.identity.title")}
          editLabel={t("settings.editProfile")}
          onEdit={() => setEditingSection("identity")}
        >
          <div className="flex flex-wrap items-center gap-4">
            <IdentityLogo schoolName={settings.identity.school_name} logoUrl={settings.identity.logo_url} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-text-primary">
                  {settings.identity.school_name}
                </span>
                <StatusBadge status={settings.identity.status} />
              </div>
              <span className="text-sm text-text-secondary">
                {settings.identity.slug}.zsmsapp.com
              </span>
              <span className="text-sm text-text-secondary">
                {orNotSet(settings.identity.email, t("settings.notSet"))}
                {settings.identity.phone ? ` · ${settings.identity.phone}` : ""}
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
              url={settings.branding.school_logo_url}
            />
            <BrandingSlot
              label={t("settings.sections.branding.mobileLogo")}
              url={settings.branding.mobile_logo_url}
            />
            <BrandingSlot
              label={t("settings.sections.branding.principalSignature")}
              url={settings.branding.principal_signature_url}
            />
            <BrandingSlot
              label={t("settings.sections.branding.portalLoader")}
              url={settings.branding.portal_loader_url}
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
              value={settings.general_behaviour.working_days
                .map((day) => t(`onboarding.options.workingDays.${day}`))
                .join(", ")}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.recordsPerPage")}
              value={settings.general_behaviour.records_per_page}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.dateFormat")}
              value={orNotSet(settings.general_behaviour.date_format, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.timeFormat")}
              value={orNotSet(settings.general_behaviour.time_format, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.absenceEndDelay")}
              value={t("settings.sections.generalBehaviour.absenceEndDelayValue", {
                days: settings.general_behaviour.absence_end_delay_days,
              })}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.notificationChannel")}
              value={orNotSet(settings.general_behaviour.notification_channel, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.studentIdPrefix")}
              value={orNotSet(settings.general_behaviour.student_id_prefix, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.generalBehaviour.staffIdPrefix")}
              value={orNotSet(settings.general_behaviour.staff_id_prefix, t("settings.notSet"))}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sections.regional.title")}
          editLabel={t("settings.edit")}
          onEdit={() => setEditingSection("regional")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsField
              label={t("settings.sections.regional.address")}
              value={orNotSet(settings.regional.address, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.regional.country")}
              value={orNotSet(settings.regional.country_code, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.regional.timezone")}
              value={orNotSet(settings.regional.timezone, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.regional.currency")}
              value={orNotSet(settings.regional.currency, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.regional.pax")}
              value={orNotSet(settings.regional.pax, t("settings.notSet"))}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings.sections.banking.title")}
          editLabel={t("settings.edit")}
          onEdit={() => setEditingSection("banking")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingsField
              label={t("settings.sections.banking.bankName")}
              value={orNotSet(settings.banking.bank_name, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.banking.accountNumber")}
              value={maskSecret(settings.banking.account_number)}
            />
            <SettingsField
              label={t("settings.sections.banking.accountName")}
              value={orNotSet(settings.banking.account_name, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.banking.branch")}
              value={orNotSet(settings.banking.branch, t("settings.notSet"))}
            />
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
              value={settings.question_bank.questions_per_page}
            />
            <SettingsField
              label={t("settings.sections.questionBank.defaultExamDuration")}
              value={t("settings.sections.questionBank.minutesValue", {
                minutes: settings.question_bank.default_exam_duration_minutes,
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
              value={orNotSet(settings.social_media.facebook, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.socialMedia.instagram")}
              value={orNotSet(settings.social_media.instagram, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.socialMedia.youtube")}
              value={orNotSet(settings.social_media.youtube, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.socialMedia.twitter")}
              value={orNotSet(settings.social_media.twitter, t("settings.notSet"))}
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
              value={maskSecret(settings.api_integrations.api_key)}
            />
            <SettingsField
              label={t("settings.sections.apiIntegrations.smsSenderName")}
              value={orNotSet(settings.api_integrations.sms_sender_name, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.apiIntegrations.clientId")}
              value={orNotSet(settings.api_integrations.client_id, t("settings.notSet"))}
            />
            <SettingsField
              label={t("settings.sections.apiIntegrations.clientSecret")}
              value={maskSecret(settings.api_integrations.client_secret)}
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
              value={settings.notification_routing.finance_alert_emails.join(", ")}
            />
            <SettingsField
              label={t("settings.sections.notificationRouting.disciplinaryAlerts")}
              value={settings.notification_routing.disciplinary_alert_emails.join(", ")}
            />
          </div>
        </SettingsCard>

        <SettingsCard title={t("settings.sections.helpFeedback.title")}>
          <p className="text-sm text-text-muted">{t("settings.sections.emptySection")}</p>
        </SettingsCard>
      </div>

      <EditSchoolIdentityPanel
        isOpen={editingSection === "identity"}
        identity={settings.identity}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.identityUpdated"));
        }}
      />

      <BrandingPanel
        isOpen={editingSection === "branding"}
        section={settings.branding}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.brandingUpdated"));
        }}
      />

      <GeneralBehaviourPanel
        isOpen={editingSection === "generalBehaviour"}
        section={settings.general_behaviour}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.generalBehaviourUpdated"));
        }}
      />

      <RegionalSettingsPanel
        isOpen={editingSection === "regional"}
        section={settings.regional}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.regionalUpdated"));
        }}
      />

      <QuestionBankPanel
        isOpen={editingSection === "questionBank"}
        section={settings.question_bank}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.questionBankUpdated"));
        }}
      />

      <NotificationRoutingPanel
        isOpen={editingSection === "notificationRouting"}
        section={settings.notification_routing}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.notificationRoutingUpdated"));
        }}
      />

      <BankingPanel
        isOpen={editingSection === "banking"}
        section={settings.banking}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.bankingUpdated"));
        }}
      />

      <SocialMediaPanel
        isOpen={editingSection === "socialMedia"}
        section={settings.social_media}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.socialMediaUpdated"));
        }}
      />

      <ApiIntegrationsPanel
        isOpen={editingSection === "apiIntegrations"}
        section={settings.api_integrations}
        onClose={closeEditPanel}
        onSaved={(updated) => {
          // Writes the fresh data straight into the cache rather than
          // invalidating — the panel's own PATCH response IS the full
          // settings object, exactly matching this query's cache shape, so
          // there's nothing a refetch would learn that we don't already
          // have in hand. Typed via the local first (rather than an
          // explicit generic on setQueryData) so TS infers the cache's
          // TData from an already-annotated value instead of trying to
          // match the object literal against setQueryData's updater overload.
          const nextSettingsResult: SettingsResult<SettingsData> = { ok: true, data: updated };
          queryClient.setQueryData(SETTINGS_QUERY_KEY, nextSettingsResult);
          closeEditPanel();
          showToast(t("settings.toast.apiIntegrationsUpdated"));
        }}
      />

      <ComingSoonPanel
        isOpen={editingSection !== null && !hasWiredPanel(editingSection)}
        title={
          editingSection && !hasWiredPanel(editingSection)
            ? t(`settings.sections.${editingSection}.title`)
            : ""
        }
        onClose={closeEditPanel}
      />
    </div>
  );
}

function SettingsMessage({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="max-w-sm text-sm text-text-muted">{text}</p>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick?: () => void;
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

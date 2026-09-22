"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { useCountries, useStates } from "@/lib/onboarding/location/hooks";
import { LANGUAGES } from "@/lib/onboarding/config";
import type { LanguageCode } from "@/lib/onboarding/types";
import { sameStringSet } from "@/lib/settings/arrayDiff";
import { updateSchoolSettings } from "@/lib/settings/settingsApi";
import type { SettingsData, SettingsUpdate } from "@/lib/settings/types";

type RegionalUpdate = NonNullable<SettingsUpdate["regional"]>;

type FormState = {
  address: string;
  city: string;
  postalCode: string;
  countryCode: string;
  regionCode: string;
  regionName: string;
  timezone: string;
  currency: string;
  language: LanguageCode;
  additionalLanguages: LanguageCode[];
  pax: string;
};

function toFormState(section: SettingsData["regional"]): FormState {
  return {
    address: section.address ?? "",
    city: section.city ?? "",
    postalCode: section.postal_code ?? "",
    countryCode: section.country_code ?? "",
    regionCode: section.region_code ?? "",
    regionName: section.region_name ?? "",
    timezone: section.timezone ?? "",
    currency: section.currency ?? "",
    // language isn't documented nullable and the contract only lists
    // "en"/"fr" as valid values — an unrecognized value falls back to "en"
    // rather than crashing the dropdown on an unmatched <option>.
    language: section.language === "fr" ? "fr" : "en",
    additionalLanguages: section.additional_languages.filter(
      (code): code is LanguageCode => code === "en" || code === "fr",
    ),
    pax: section.pax ?? "",
  };
}

function buildUpdate(original: FormState, form: FormState): RegionalUpdate {
  const update: RegionalUpdate = {};

  const address = form.address.trim();
  if (address !== original.address.trim()) update.address = address || null;

  const city = form.city.trim();
  if (city !== original.city.trim()) update.city = city || null;

  const postalCode = form.postalCode.trim();
  if (postalCode !== original.postalCode.trim()) update.postal_code = postalCode || null;

  const countryCode = form.countryCode.trim();
  if (countryCode !== original.countryCode.trim()) update.country_code = countryCode || null;

  const regionCode = form.regionCode.trim();
  if (regionCode !== original.regionCode.trim()) update.region_code = regionCode || null;

  const regionName = form.regionName.trim();
  if (regionName !== original.regionName.trim()) update.region_name = regionName || null;

  const timezone = form.timezone.trim();
  if (timezone !== original.timezone.trim()) update.timezone = timezone || null;

  const currency = form.currency.trim();
  if (currency !== original.currency.trim()) update.currency = currency || null;

  if (form.language !== original.language) update.language = form.language;

  if (!sameStringSet(form.additionalLanguages, original.additionalLanguages)) {
    update.additional_languages = form.additionalLanguages;
  }

  const pax = form.pax.trim();
  if (pax !== original.pax.trim()) update.pax = pax || null;

  return update;
}

type RegionalSettingsPanelProps = {
  isOpen: boolean;
  section: SettingsData["regional"];
  onClose: () => void;
  onSaved: (settings: SettingsData) => void;
};

export function RegionalSettingsPanel({
  isOpen,
  section,
  onClose,
  onSaved,
}: RegionalSettingsPanelProps) {
  const t = useTranslations();
  const { countries, loading: countriesLoading } = useCountries();
  const [original, setOriginal] = useState<FormState>(() => toFormState(section));
  const [form, setForm] = useState<FormState>(() => toFormState(section));
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { states, loading: statesLoading } = useStates(form.countryCode);

  useEffect(() => {
    if (isOpen) {
      const state = toFormState(section);
      setOriginal(state);
      setForm(state);
      setGeneralError(null);
      setIsSaving(false);
    }
  }, [isOpen, section]);

  const selectedCountry = countries.find((country) => country.code === form.countryCode);
  const countrySelected = !!form.countryCode;
  const usingStateSelect = countrySelected && !statesLoading && states.length > 0;

  // Same auto-fill as onboarding's location step: picking a country resets
  // the state (a stale one may not belong to the new country) and fills
  // timezone/currency from that country's data.
  const handleCountryChange = (code: string) => {
    const country = countries.find((candidate) => candidate.code === code);
    setForm((current) => ({
      ...current,
      countryCode: code,
      regionCode: "",
      regionName: "",
      timezone: country?.timezones[0] ?? "",
      currency: country?.currency ?? "",
    }));
  };

  const handleStateChange = (code: string) => {
    const state = states.find((candidate) => candidate.code === code);
    setForm((current) => ({ ...current, regionCode: code, regionName: state?.name ?? "" }));
  };

  const handleSave = async () => {
    setGeneralError(null);

    const update = buildUpdate(original, form);
    if (Object.keys(update).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    const result = await updateSchoolSettings({ regional: update });
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }

    switch (result.kind) {
      case "validation":
        setGeneralError(t("settings.regionalPanel.errors.submitField"));
        break;
      case "forbidden":
        setGeneralError(t("settings.regionalPanel.errors.forbidden"));
        break;
      case "devBypassUnavailable":
        setGeneralError(t("settings.errors.devBypassUnavailable"));
        break;
      default:
        setGeneralError(t("settings.regionalPanel.errors.submitFailed"));
    }
  };

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("settings.regionalPanel.title")}
      subtitle={t("settings.regionalPanel.subtitle")}
      onSave={handleSave}
      isSaving={isSaving}
    >
      <div className="flex flex-col gap-5">
        {generalError ? (
          <div className="rounded-md bg-error/10 px-4 py-3 text-sm text-error">{generalError}</div>
        ) : null}

        <InputField
          id="edit-regional-address"
          label={t("settings.regionalPanel.address.label")}
          value={form.address}
          onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
        />

        <InputField
          id="edit-regional-city"
          label={t("settings.regionalPanel.city.label")}
          value={form.city}
          onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
        />

        <InputField
          id="edit-regional-postal-code"
          label={t("settings.regionalPanel.postalCode.label")}
          value={form.postalCode}
          onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))}
        />

        <SearchableSelect
          id="edit-regional-country"
          label={t("settings.regionalPanel.country.label")}
          placeholder={t("settings.regionalPanel.country.placeholder")}
          options={countries.map((country) => ({
            value: country.code,
            label: `${country.flag} ${country.name}`,
            searchText: `${country.name} ${country.code}`,
          }))}
          value={form.countryCode}
          onChange={handleCountryChange}
          loading={countriesLoading}
          loadingLabel={t("onboarding.common.loading")}
          noOptionsLabel={t("onboarding.common.noResults")}
        />

        {usingStateSelect ? (
          <SearchableSelect
            id="edit-regional-region"
            label={t("settings.regionalPanel.region.label")}
            placeholder={t("onboarding.step1.location.region.searchPlaceholder")}
            options={states.map((state) => ({ value: state.code, label: state.name }))}
            value={form.regionCode}
            onChange={handleStateChange}
            loading={statesLoading}
            loadingLabel={t("onboarding.common.loading")}
            noOptionsLabel={t("onboarding.common.noResults")}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <InputField
              id="edit-regional-region"
              label={t("settings.regionalPanel.region.label")}
              placeholder={t("onboarding.step1.location.region.placeholder")}
              value={form.regionName}
              disabled={!countrySelected || statesLoading}
              onChange={(event) => setForm((current) => ({ ...current, regionName: event.target.value }))}
            />
            {!countrySelected && (
              <p className="text-xs text-text-muted">
                {t("onboarding.step1.location.selectCountryFirst")}
              </p>
            )}
          </div>
        )}

        {selectedCountry && selectedCountry.timezones.length > 1 ? (
          <SelectField
            id="edit-regional-timezone"
            label={t("settings.regionalPanel.timezone.label")}
            value={form.timezone}
            onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
          >
            {selectedCountry.timezones.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </SelectField>
        ) : (
          // A single-timezone (or unselected) country has nothing to choose
          // between — lock the field so it can't drift from the exact IANA
          // string the backend expects, same as onboarding.
          <InputField
            id="edit-regional-timezone"
            label={t("settings.regionalPanel.timezone.label")}
            placeholder="—"
            value={form.timezone}
            disabled
          />
        )}

        <InputField
          id="edit-regional-currency"
          label={t("settings.regionalPanel.currency.label")}
          placeholder="—"
          value={form.currency}
          disabled
        />

        <SelectField
          id="edit-regional-language"
          label={t("settings.regionalPanel.language.label")}
          value={form.language}
          onChange={(event) =>
            setForm((current) => ({ ...current, language: event.target.value as LanguageCode }))
          }
        >
          {LANGUAGES.map((language) => (
            <option key={language.value} value={language.value}>
              {t(language.labelKey)}
            </option>
          ))}
        </SelectField>

        <ChipGroup
          label={t("settings.regionalPanel.additionalLanguages.label")}
          options={LANGUAGES.filter((language) => language.value !== form.language).map((language) => ({
            value: language.value,
            label: t(language.labelKey),
          }))}
          value={form.additionalLanguages}
          onChange={(values) =>
            setForm((current) => ({ ...current, additionalLanguages: values as LanguageCode[] }))
          }
        />

        <InputField
          id="edit-regional-pax"
          label={t("settings.regionalPanel.pax.label")}
          value={form.pax}
          onChange={(event) => setForm((current) => ({ ...current, pax: event.target.value }))}
        />
      </div>
    </SlideOverPanel>
  );
}

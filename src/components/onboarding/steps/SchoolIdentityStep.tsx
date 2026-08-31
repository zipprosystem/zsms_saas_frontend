"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { SelectField } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ChipGroup } from "@/components/ui/ChipGroup";
import { Toggle } from "@/components/ui/Toggle";
import { SubdomainField } from "@/components/onboarding/SubdomainField";
import { PhoneField } from "@/components/onboarding/PhoneField";
import { LogoUpload } from "@/components/onboarding/LogoUpload";
import { useCities, useCountries, useStates } from "@/lib/onboarding/location/hooks";
import { LANGUAGES, WORKING_DAYS } from "@/lib/onboarding/config";
import type {
  LanguageCode,
  OnboardingData,
  SlugStatus,
  WorkingDay,
} from "@/lib/onboarding/types";
import type { FieldErrors } from "@/lib/onboarding/validation";

type SchoolIdentityStepProps = {
  data: OnboardingData;
  errors: FieldErrors;
  onSchoolChange: (patch: Partial<OnboardingData["school"]>) => void;
  onAdministratorChange: (patch: Partial<OnboardingData["administrator"]>) => void;
  onLocationChange: (patch: Partial<OnboardingData["location"]>) => void;
  onLanguageChange: (patch: Partial<OnboardingData["language"]>) => void;
  onSlugStatusChange: (status: SlugStatus) => void;
};

export function SchoolIdentityStep({
  data,
  errors,
  onSchoolChange,
  onAdministratorChange,
  onLocationChange,
  onLanguageChange,
  onSlugStatusChange,
}: SchoolIdentityStepProps) {
  const t = useTranslations();
  const { countries, loading: countriesLoading } = useCountries();
  const { states, loading: statesLoading } = useStates(data.location.countryCode);
  const { cities, loading: citiesLoading } = useCities(
    data.location.countryCode,
    data.location.stateCode,
  );

  const errorText = (key: string) => (errors[key] ? t(errors[key]) : undefined);

  const countrySelected = !!data.location.countryCode;
  const usingStateSelect = countrySelected && !statesLoading && states.length > 0;
  const stateReady = usingStateSelect
    ? !!data.location.stateCode
    : countrySelected && !statesLoading;
  const usingCitySelect = stateReady && !citiesLoading && cities.length > 0;

  const handleCountryChange = (code: string) => {
    const country = countries.find((candidate) => candidate.code === code);
    onLocationChange({
      countryCode: code,
      stateCode: "",
      region: "",
      city: "",
      timezone: country?.timezones[0] ?? "UTC",
      currency: country?.currency || "USD",
    });
    if (country?.phone) onSchoolChange({ phoneDialCode: country.phone });
  };

  const handleStateChange = (code: string) => {
    const state = states.find((candidate) => candidate.code === code);
    onLocationChange({ stateCode: code, region: state?.name ?? "", city: "" });
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="font-display text-xl font-medium text-text-primary sm:text-2xl">
          {t("onboarding.step1.heading")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t("onboarding.step1.subheading")}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <InputField
          id="school-name"
          label={t("onboarding.step1.schoolName.label")}
          placeholder={t("onboarding.step1.schoolName.placeholder")}
          value={data.school.name}
          onChange={(event) => onSchoolChange({ name: event.target.value })}
          hasError={!!errors["school.name"]}
          error={errorText("school.name")}
        />

        <SubdomainField
          label={t("onboarding.step1.subdomain.label")}
          suffix={t("onboarding.step1.subdomain.suffix")}
          value={data.school.slug}
          onChange={(value) => onSchoolChange({ slug: value })}
          onStatusChange={onSlugStatusChange}
          helper={t("onboarding.step1.subdomain.helper")}
          checkingLabel={t("onboarding.step1.subdomain.checking")}
          availableLabel={t("onboarding.step1.subdomain.available")}
          takenLabel={t("onboarding.step1.subdomain.taken")}
          hasError={!!errors["school.slug"]}
          error={errorText("school.slug")}
        />

        <div className="flex flex-col gap-1.5">
          <InputField
            id="custom-domain"
            label={t("onboarding.step1.customDomain.label")}
            placeholder={t("onboarding.step1.customDomain.placeholder")}
            value={data.school.customDomain}
            onChange={(event) => onSchoolChange({ customDomain: event.target.value })}
          />
          <p className="text-xs text-text-muted">{t("onboarding.step1.customDomain.helper")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("onboarding.step1.administrator.sectionTitle")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField
            id="admin-first-name"
            label={t("onboarding.step1.administrator.firstName.label")}
            placeholder={t("onboarding.step1.administrator.firstName.placeholder")}
            value={data.administrator.firstName}
            onChange={(event) => onAdministratorChange({ firstName: event.target.value })}
            hasError={!!errors["administrator.firstName"]}
            error={errorText("administrator.firstName")}
          />
          <InputField
            id="admin-last-name"
            label={t("onboarding.step1.administrator.lastName.label")}
            placeholder={t("onboarding.step1.administrator.lastName.placeholder")}
            value={data.administrator.lastName}
            onChange={(event) => onAdministratorChange({ lastName: event.target.value })}
            hasError={!!errors["administrator.lastName"]}
            error={errorText("administrator.lastName")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <InputField
            id="admin-email"
            type="email"
            label={t("onboarding.step1.administrator.email.label")}
            placeholder={t("onboarding.step1.administrator.email.placeholder")}
            value={data.administrator.email}
            onChange={(event) => onAdministratorChange({ email: event.target.value })}
            hasError={!!errors["administrator.email"]}
            error={errorText("administrator.email")}
          />
          <p className="text-xs text-text-muted">
            {t("onboarding.step1.administrator.emailHelper")}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          id="school-email"
          type="email"
          label={t("onboarding.step1.schoolEmail.label")}
          placeholder={t("onboarding.step1.schoolEmail.placeholder")}
          value={data.school.email}
          onChange={(event) => onSchoolChange({ email: event.target.value })}
        />
        <PhoneField
          id="school-phone"
          label={t("onboarding.step1.schoolPhone.label")}
          placeholder={t("onboarding.step1.schoolPhone.placeholder")}
          dialCode={data.school.phoneDialCode}
          number={data.school.phoneNumber}
          countries={countries}
          onDialCodeChange={(value) => onSchoolChange({ phoneDialCode: value })}
          onNumberChange={(value) => onSchoolChange({ phoneNumber: value })}
        />
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("onboarding.step1.location.sectionTitle")}
        </h3>
        <p className="-mt-2 text-xs text-text-muted">
          {t("onboarding.step1.location.autoFillHelper")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SearchableSelect
            id="location-country"
            label={t("onboarding.step1.location.country.label")}
            placeholder={t("onboarding.step1.location.country.placeholder")}
            options={countries.map((country) => ({
              value: country.code,
              label: `${country.flag} ${country.name}`,
              searchText: `${country.name} ${country.code} +${country.phone}`,
            }))}
            value={data.location.countryCode}
            onChange={handleCountryChange}
            loading={countriesLoading}
            loadingLabel={t("onboarding.common.loading")}
            noOptionsLabel={t("onboarding.common.noResults")}
            hasError={!!errors["location.countryCode"]}
            error={errorText("location.countryCode")}
          />

          {usingStateSelect ? (
            <SearchableSelect
              id="location-region"
              label={t("onboarding.step1.location.region.label")}
              placeholder={t("onboarding.step1.location.region.searchPlaceholder")}
              options={states.map((state) => ({ value: state.code, label: state.name }))}
              value={data.location.stateCode}
              onChange={handleStateChange}
              loading={statesLoading}
              loadingLabel={t("onboarding.common.loading")}
              noOptionsLabel={t("onboarding.common.noResults")}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <InputField
                id="location-region"
                label={t("onboarding.step1.location.region.label")}
                placeholder={t("onboarding.step1.location.region.placeholder")}
                value={data.location.region}
                disabled={!countrySelected || statesLoading}
                onChange={(event) => onLocationChange({ region: event.target.value })}
              />
              {!countrySelected && (
                <p className="text-xs text-text-muted">
                  {t("onboarding.step1.location.selectCountryFirst")}
                </p>
              )}
            </div>
          )}

          {usingCitySelect ? (
            <SearchableSelect
              id="location-city"
              label={t("onboarding.step1.location.city.label")}
              placeholder={t("onboarding.step1.location.city.searchPlaceholder")}
              options={cities.map((city) => ({ value: city, label: city }))}
              value={data.location.city}
              onChange={(city) => onLocationChange({ city })}
              loading={citiesLoading}
              loadingLabel={t("onboarding.common.loading")}
              noOptionsLabel={t("onboarding.common.noResults")}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <InputField
                id="location-city"
                label={t("onboarding.step1.location.city.label")}
                placeholder={t("onboarding.step1.location.city.placeholder")}
                value={data.location.city}
                disabled={!stateReady}
                onChange={(event) => onLocationChange({ city: event.target.value })}
              />
              {!stateReady && (
                <p className="text-xs text-text-muted">
                  {t(
                    usingStateSelect
                      ? "onboarding.step1.location.selectStateFirst"
                      : "onboarding.step1.location.selectCountryFirst",
                  )}
                </p>
              )}
            </div>
          )}

          <InputField
            id="location-street"
            label={t("onboarding.step1.location.street.label")}
            placeholder={t("onboarding.step1.location.street.placeholder")}
            value={data.location.street}
            onChange={(event) => onLocationChange({ street: event.target.value })}
          />
          <InputField
            id="location-postal-code"
            label={t("onboarding.step1.location.postalCode.label")}
            placeholder={t("onboarding.step1.location.postalCode.placeholder")}
            value={data.location.postalCode}
            onChange={(event) => onLocationChange({ postalCode: event.target.value })}
          />
          <InputField
            id="location-timezone"
            label={t("onboarding.step1.location.timezone.label")}
            placeholder="—"
            value={data.location.timezone}
            onChange={(event) => onLocationChange({ timezone: event.target.value })}
          />
          <InputField
            id="location-currency"
            label={t("onboarding.step1.location.currency.label")}
            placeholder="—"
            value={data.location.currency}
            onChange={(event) => onLocationChange({ currency: event.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {t("onboarding.step1.language.sectionTitle")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="language-default"
            label={t("onboarding.step1.language.default.label")}
            value={data.language.default}
            onChange={(event) =>
              onLanguageChange({ default: event.target.value as LanguageCode })
            }
            hasError={!!errors["language.default"]}
            error={errorText("language.default")}
          >
            {LANGUAGES.map((language) => (
              <option key={language.value} value={language.value}>
                {t(language.labelKey)}
              </option>
            ))}
          </SelectField>
          <ChipGroup
            label={t("onboarding.step1.language.additional.label")}
            options={LANGUAGES.filter((language) => language.value !== data.language.default).map(
              (language) => ({ value: language.value, label: t(language.labelKey) }),
            )}
            value={data.language.additional}
            onChange={(values) => onLanguageChange({ additional: values as LanguageCode[] })}
          />
        </div>
      </div>

      <LogoUpload
        label={t("onboarding.step1.logo.label")}
        helper={t("onboarding.step1.logo.helper")}
        uploadLabel={t("onboarding.step1.logo.upload")}
        changeLabel={t("onboarding.step1.logo.change")}
        removeLabel={t("onboarding.step1.logo.remove")}
        file={data.school.logo}
        previewUrl={data.school.logoPreviewUrl}
        onChange={(logo, logoPreviewUrl) => onSchoolChange({ logo, logoPreviewUrl })}
      />

      <ChipGroup
        label={t("onboarding.step1.workingDays.label")}
        options={WORKING_DAYS.map((day) => ({ value: day.value, label: t(day.labelKey) }))}
        value={data.school.workingDays}
        onChange={(values) => onSchoolChange({ workingDays: values as WorkingDay[] })}
      />

      <Toggle
        id="show-website"
        label={t("onboarding.step1.showWebsite.label")}
        helper={t("onboarding.step1.showWebsite.helper")}
        checked={data.school.showWebsiteToVisitors}
        onChange={(showWebsiteToVisitors) => onSchoolChange({ showWebsiteToVisitors })}
      />
    </div>
  );
}

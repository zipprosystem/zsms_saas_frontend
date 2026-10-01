"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toggle } from "@/components/ui/Toggle";
import { useCities, useCountries, useStates } from "@/lib/onboarding/location/hooks";
import type { LocationCountry } from "@/lib/onboarding/location/types";
import type { AddressBlockForm, AddressForm, FieldErrors } from "@/components/students/wizard/studentFormTypes";

/** Country→State→City cascade, same pattern as onboarding's SchoolIdentityStep.tsx — free-text fallback when a country has no states/cities dataset file. */
function AddressBlockFields({
  idPrefix,
  value,
  errorPrefix,
  errors,
  countries,
  countriesLoading,
  onChange,
}: {
  idPrefix: string;
  value: AddressBlockForm;
  errorPrefix: "home" | "other";
  errors: FieldErrors;
  countries: LocationCountry[];
  countriesLoading: boolean;
  onChange: (patch: Partial<AddressBlockForm>) => void;
}) {
  const t = useTranslations();
  const { states, loading: statesLoading } = useStates(value.country_code);
  const { cities, loading: citiesLoading } = useCities(value.country_code, value.state_code);

  const countrySelected = !!value.country_code;
  const usingStateSelect = countrySelected && !statesLoading && states.length > 0;
  const stateReady = usingStateSelect ? !!value.state_code : countrySelected && !statesLoading;
  const usingCitySelect = stateReady && !citiesLoading && cities.length > 0;

  const handleCountryChange = (code: string) => {
    onChange({ country_code: code, state_code: "", city: "" });
  };
  const handleStateChange = (code: string) => {
    onChange({ state_code: code, city: "" });
  };

  return (
    <div className="flex flex-col gap-4">
      <TextareaField
        id={`${idPrefix}-street`}
        label={t("students.wizard.fields.street.label")}
        value={value.street}
        onChange={(event) => onChange({ street: event.target.value })}
        hasError={!!errors[`${errorPrefix}.street`]}
        error={errors[`${errorPrefix}.street`] ? t(errors[`${errorPrefix}.street`]) : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SearchableSelect
          id={`${idPrefix}-country`}
          label={t("students.wizard.fields.country.label")}
          placeholder={t("students.wizard.fields.country.placeholder")}
          options={countries.map((country) => ({
            value: country.code,
            label: `${country.flag} ${country.name}`,
            searchText: `${country.name} ${country.code}`,
          }))}
          value={value.country_code}
          onChange={handleCountryChange}
          loading={countriesLoading}
          loadingLabel={t("onboarding.common.loading")}
          noOptionsLabel={t("onboarding.common.noResults")}
          hasError={!!errors[`${errorPrefix}.country_code`]}
          error={errors[`${errorPrefix}.country_code`] ? t(errors[`${errorPrefix}.country_code`]) : undefined}
        />

        {usingStateSelect ? (
          <SearchableSelect
            id={`${idPrefix}-state`}
            label={t("students.wizard.fields.state.label")}
            placeholder={t("students.wizard.fields.state.searchPlaceholder")}
            options={states.map((state) => ({ value: state.code, label: state.name }))}
            value={value.state_code}
            onChange={handleStateChange}
            loading={statesLoading}
            loadingLabel={t("onboarding.common.loading")}
            noOptionsLabel={t("onboarding.common.noResults")}
          />
        ) : (
          <InputField
            id={`${idPrefix}-state`}
            label={t("students.wizard.fields.state.label")}
            placeholder={t("students.wizard.fields.state.placeholder")}
            value={value.state_code}
            disabled={!countrySelected || statesLoading}
            onChange={(event) => onChange({ state_code: event.target.value })}
          />
        )}

        {usingCitySelect ? (
          <SearchableSelect
            id={`${idPrefix}-city`}
            label={t("students.wizard.fields.city.label")}
            placeholder={t("students.wizard.fields.city.searchPlaceholder")}
            options={cities.map((city) => ({ value: city, label: city }))}
            value={value.city}
            onChange={(city) => onChange({ city })}
            loading={citiesLoading}
            loadingLabel={t("onboarding.common.loading")}
            noOptionsLabel={t("onboarding.common.noResults")}
          />
        ) : (
          <InputField
            id={`${idPrefix}-city`}
            label={t("students.wizard.fields.city.label")}
            placeholder={t("students.wizard.fields.city.placeholder")}
            value={value.city}
            disabled={!stateReady}
            onChange={(event) => onChange({ city: event.target.value })}
          />
        )}

        <InputField
          id={`${idPrefix}-lga`}
          label={t("students.wizard.fields.lgaOrArea.label")}
          placeholder={t("students.wizard.fields.lgaOrArea.placeholder")}
          value={value.lga_or_area}
          onChange={(event) => onChange({ lga_or_area: event.target.value })}
        />
        <InputField
          id={`${idPrefix}-postal-code`}
          label={t("students.wizard.fields.postalCode.label")}
          value={value.postal_code}
          onChange={(event) => onChange({ postal_code: event.target.value })}
        />
      </div>
    </div>
  );
}

export function AddressStep({
  data,
  errors,
  onChange,
}: {
  data: AddressForm;
  errors: FieldErrors;
  onChange: (patch: Partial<AddressForm>) => void;
}) {
  const t = useTranslations();
  const { countries, loading: countriesLoading } = useCountries();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.fields.homeAddress.title")}</p>
        <AddressBlockFields
          idPrefix="wizard-home-address"
          value={data.home}
          errorPrefix="home"
          errors={errors}
          countries={countries}
          countriesLoading={countriesLoading}
          onChange={(patch) => onChange({ home: { ...data.home, ...patch } })}
        />
      </div>

      <Toggle
        id="wizard-other-address-same"
        label={t("students.wizard.fields.otherAddressSame.label")}
        checked={data.other_same_as_home}
        onChange={(checked) => onChange({ other_same_as_home: checked })}
      />

      {!data.other_same_as_home ? (
        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">{t("students.wizard.fields.otherAddress.title")}</p>
          <AddressBlockFields
            idPrefix="wizard-other-address"
            value={data.other}
            errorPrefix="other"
            errors={errors}
            countries={countries}
            countriesLoading={countriesLoading}
            onChange={(patch) => onChange({ other: { ...data.other, ...patch } })}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold text-text-primary">{t("students.wizard.fields.emergencyContacts.title")}</p>
        <p className="-mt-2 text-xs text-text-muted">{t("students.wizard.fields.emergencyContacts.hint")}</p>
        {data.emergency_contacts.map((contact, index) => (
          <div key={index} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InputField
              id={`wizard-emergency-name-${index}`}
              label={t("students.wizard.fields.emergencyContacts.nameLabel", { number: index + 1 })}
              value={contact.name}
              onChange={(event) => {
                const next = [...data.emergency_contacts] as AddressForm["emergency_contacts"];
                next[index] = { ...next[index], name: event.target.value };
                onChange({ emergency_contacts: next });
              }}
            />
            <InputField
              id={`wizard-emergency-phone-${index}`}
              type="tel"
              label={t("students.wizard.fields.emergencyContacts.phoneLabel", { number: index + 1 })}
              value={contact.phone}
              onChange={(event) => {
                const next = [...data.emergency_contacts] as AddressForm["emergency_contacts"];
                next[index] = { ...next[index], phone: event.target.value };
                onChange({ emergency_contacts: next });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

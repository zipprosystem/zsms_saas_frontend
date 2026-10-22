"use client";

import { useTranslations } from "next-intl";
import { InputField } from "@/components/ui/Input";
import { TextareaField } from "@/components/ui/Textarea";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Toggle } from "@/components/ui/Toggle";
import { useCities, useCountries, useStates } from "@/lib/onboarding/location/hooks";
import type { LocationCountry } from "@/lib/onboarding/location/types";
import { StaffStepSection } from "@/components/hr/wizard/StaffStepSection";
import type { AddressForm, StaffForm } from "@/components/hr/wizard/staffForm";

/** Country → State → City cascade with a free-text fallback — same pattern as the Students address step. */
function AddressFields({
  idPrefix,
  value,
  countries,
  countriesLoading,
  onChange,
}: {
  idPrefix: string;
  value: AddressForm;
  countries: LocationCountry[];
  countriesLoading: boolean;
  onChange: (patch: Partial<AddressForm>) => void;
}) {
  const t = useTranslations();
  const { states, loading: statesLoading } = useStates(value.country_code);
  const { cities, loading: citiesLoading } = useCities(value.country_code, value.state_code);

  const countrySelected = !!value.country_code;
  const usingStateSelect = countrySelected && !statesLoading && states.length > 0;
  const stateReady = usingStateSelect ? !!value.state_code : countrySelected && !statesLoading;
  const usingCitySelect = stateReady && !citiesLoading && cities.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SearchableSelect
          id={`${idPrefix}-country`}
          label={t("hr.wizard.fields.country.label")}
          placeholder={t("hr.wizard.fields.country.placeholder")}
          options={countries.map((country) => ({
            value: country.code,
            label: `${country.flag} ${country.name}`,
            searchText: `${country.name} ${country.code}`,
          }))}
          value={value.country_code}
          onChange={(code) => onChange({ country_code: code, state_code: "", city: "" })}
          loading={countriesLoading}
          loadingLabel={t("hr.common.loading")}
          noOptionsLabel={t("hr.wizard.fields.noResults")}
        />
        {usingStateSelect ? (
          <SearchableSelect
            id={`${idPrefix}-state`}
            label={t("hr.wizard.fields.state.label")}
            placeholder={t("hr.wizard.fields.state.placeholder")}
            options={states.map((state) => ({ value: state.code, label: state.name }))}
            value={value.state_code}
            onChange={(code) => onChange({ state_code: code, city: "" })}
            loading={statesLoading}
            loadingLabel={t("hr.common.loading")}
            noOptionsLabel={t("hr.wizard.fields.noResults")}
          />
        ) : (
          <InputField
            id={`${idPrefix}-state`}
            label={t("hr.wizard.fields.state.label")}
            value={value.state_code}
            disabled={!countrySelected || statesLoading}
            onChange={(event) => onChange({ state_code: event.target.value })}
          />
        )}
        {usingCitySelect ? (
          <SearchableSelect
            id={`${idPrefix}-city`}
            label={t("hr.wizard.fields.city.label")}
            placeholder={t("hr.wizard.fields.city.placeholder")}
            options={cities.map((city) => ({ value: city, label: city }))}
            value={value.city}
            onChange={(city) => onChange({ city })}
            loading={citiesLoading}
            loadingLabel={t("hr.common.loading")}
            noOptionsLabel={t("hr.wizard.fields.noResults")}
          />
        ) : (
          <InputField
            id={`${idPrefix}-city`}
            label={t("hr.wizard.fields.city.label")}
            value={value.city}
            disabled={!stateReady}
            onChange={(event) => onChange({ city: event.target.value })}
          />
        )}
        <InputField
          id={`${idPrefix}-postal-code`}
          label={t("hr.wizard.fields.postalCode.label")}
          value={value.postal_code}
          onChange={(event) => onChange({ postal_code: event.target.value })}
        />
        <InputField
          id={`${idPrefix}-mobile`}
          type="tel"
          label={t("hr.wizard.fields.mobile.label")}
          value={value.mobile}
          onChange={(event) => onChange({ mobile: event.target.value })}
        />
      </div>
      <TextareaField
        id={`${idPrefix}-address-line`}
        label={t("hr.wizard.fields.addressLine.label")}
        placeholder={t("hr.wizard.fields.addressLine.placeholder")}
        value={value.address_line}
        onChange={(event) => onChange({ address_line: event.target.value })}
      />
    </div>
  );
}

/** Step 4 — optional Present + Permanent address; "Same as present" is the source of truth (no stale copy kept). */
export function StaffAddressStep({ form, onChange }: { form: StaffForm; onChange: (patch: Partial<StaffForm>) => void }) {
  const t = useTranslations();
  const { countries, loading } = useCountries();

  return (
    <div className="flex flex-col gap-6">
      <StaffStepSection title={t("hr.wizard.sections.presentAddress.title")} subtitle={t("hr.wizard.sections.presentAddress.subtitle")}>
        <AddressFields
          idPrefix="present"
          value={form.present_address}
          countries={countries}
          countriesLoading={loading}
          onChange={(patch) => onChange({ present_address: { ...form.present_address, ...patch } })}
        />
      </StaffStepSection>
      <StaffStepSection title={t("hr.wizard.sections.permanentAddress.title")}>
        <Toggle
          id="permanent-same-as-present"
          label={t("hr.wizard.fields.sameAsPresent.label")}
          checked={form.permanent_same_as_present}
          onChange={(checked) => onChange({ permanent_same_as_present: checked })}
        />
        {form.permanent_same_as_present ? null : (
          <AddressFields
            idPrefix="permanent"
            value={form.permanent_address}
            countries={countries}
            countriesLoading={loading}
            onChange={(patch) => onChange({ permanent_address: { ...form.permanent_address, ...patch } })}
          />
        )}
      </StaffStepSection>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { throwIfTransient } from "@/lib/setup/crudTypes";
import { searchSubjects, subjectSearchQueryKey } from "@/lib/hr/staffRecordsApi";

const DEBOUNCE_MS = 300;

type SubjectSearchSelectProps = {
  id: string;
  yearId: string;
  classId: string;
  value: string;
  /** Name for the saved value, so it shows before any search has run. */
  valueName: string | null;
  /** A pick that repeats another row's subject + arm is rejected by the caller (the row shows why). */
  onChange: (subjectId: string) => void;
  disabled?: boolean;
};

/**
 * Subject picker for a staff subject assignment, backed by the backend's
 * SERVER-SIDE subject search (staffRecordsApi.searchSubjects), scoped to
 * the selected academic year and the row's class. Typing is debounced;
 * an empty query lists the class's subjects for that year.
 */
export function SubjectSearchSelect({ id, yearId, classId, value, valueName, onChange, disabled }: SubjectSearchSelectProps) {
  const t = useTranslations();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const params = { search, academicYearId: yearId, classId };
  const query = useQuery({
    queryKey: subjectSearchQueryKey(params),
    queryFn: () => searchSubjects(params).then(throwIfTransient),
    enabled: !disabled && !!classId,
    staleTime: 60_000,
  });
  const results = query.data?.ok ? query.data.data : [];
  const options = results.map((subject) => ({ value: subject.id, label: subject.name }));
  // Keep the saved subject selectable/labelled even when it isn't in the current results.
  if (value && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: valueName ?? "—" });
  }

  return (
    <SearchableSelect
      id={id}
      label={t("hr.wizard.fields.subject.label")}
      placeholder={classId ? t("hr.wizard.fields.subject.searchPlaceholder") : t("hr.wizard.fields.subject.placeholder")}
      options={options}
      value={value}
      onChange={onChange}
      onQueryChange={setTyped}
      disabled={disabled || !classId}
      loading={query.isFetching && results.length === 0}
      loadingLabel={t("hr.common.loading")}
      noOptionsLabel={t("hr.wizard.fields.subject.noMatches")}
    />
  );
}

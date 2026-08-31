"use client";

import { useEffect, useState } from "react";
import { loadCities, loadCountries, loadStates } from "./loader";
import type { LocationCountry, LocationState } from "./types";

export function useCountries(): { countries: LocationCountry[]; loading: boolean } {
  const [countries, setCountries] = useState<LocationCountry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadCountries()
      .then((data) => {
        if (!cancelled) setCountries(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { countries, loading };
}

export function useStates(countryCode: string): { states: LocationState[]; loading: boolean } {
  const [states, setStates] = useState<LocationState[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) {
      setStates([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadStates(countryCode)
      .then((data) => {
        if (!cancelled) setStates(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  return { states, loading };
}

export function useCities(
  countryCode: string,
  stateCode: string,
): { cities: string[]; loading: boolean } {
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode || !stateCode) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadCities(countryCode, stateCode)
      .then((data) => {
        if (!cancelled) setCities(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [countryCode, stateCode]);

  return { cities, loading };
}

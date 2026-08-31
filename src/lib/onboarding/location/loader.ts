import type { LocationCountry, LocationState } from "./types";

// Fetches the static datasets written by scripts/generate-location-data.mjs.
// Countries are small and fetched once up front; states/cities are fetched
// lazily per country/state so the public onboarding page never downloads
// more location data than the visitor actually needs. A missing states/
// cities file (country or state with no sub-data in the dataset) is
// expected, not an error — it resolves to [] so the UI falls back to free
// text, per the "N/A" case.

let countriesPromise: Promise<LocationCountry[]> | null = null;
const statesCache = new Map<string, Promise<LocationState[]>>();
const citiesCache = new Map<string, Promise<string[]>>();

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
  return res.json() as Promise<T>;
}

export function loadCountries(): Promise<LocationCountry[]> {
  if (!countriesPromise) {
    countriesPromise = fetchJson<LocationCountry[]>("/data/countries.json");
  }
  return countriesPromise;
}

export function loadStates(countryCode: string): Promise<LocationState[]> {
  if (!countryCode) return Promise.resolve([]);
  let entry = statesCache.get(countryCode);
  if (!entry) {
    entry = fetchJson<LocationState[]>(`/data/states/${countryCode}.json`).catch(() => []);
    statesCache.set(countryCode, entry);
  }
  return entry;
}

export function loadCities(countryCode: string, stateCode: string): Promise<string[]> {
  if (!countryCode || !stateCode) return Promise.resolve([]);
  const key = `${countryCode}/${stateCode}`;
  let entry = citiesCache.get(key);
  if (!entry) {
    entry = fetchJson<string[]>(`/data/cities/${countryCode}/${stateCode}.json`).catch(() => []);
    citiesCache.set(key, entry);
  }
  return entry;
}

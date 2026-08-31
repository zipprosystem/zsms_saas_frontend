/**
 * Generates offline location datasets under public/data/ for the
 * onboarding wizard's Country → State → City cascade.
 *
 * Run: node scripts/generate-location-data.mjs
 *
 * Source (build-time only — the app never imports this package; it only
 * fetches the static JSON this script writes, so nothing from
 * country-state-city ships to the browser):
 * - country-state-city
 *
 * Unlike a single large blob, states/cities are split into small per-country
 * / per-state files so the onboarding page (public, no auth, first thing a
 * visitor loads) only ever fetches the country a visitor actually picks —
 * not a multi-megabyte dataset up front.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Country, State, City } = require("country-state-city");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/data");
const statesDir = path.join(outDir, "states");
const citiesDir = path.join(outDir, "cities");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

ensureDir(outDir);
ensureDir(statesDir);
ensureDir(citiesDir);

// ── Countries (eager-fetched: small, needed immediately for the select) ────
const allCountries = Country.getAllCountries();
const countries = allCountries
  .map((c) => ({
    code: c.isoCode,
    name: c.name,
    phone: c.phonecode || "",
    currency: c.currency || "",
    timezones: (c.timezones || []).map((tz) => tz.zoneName),
    flag: c.flag || "",
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeJson(path.join(outDir, "countries.json"), countries);
console.log(`✓ countries.json (${countries.length} rows)`);

// ── States + Cities (lazy-fetched per country / per state) ─────────────────
let stateFileCount = 0;
let cityFileCount = 0;
let totalCities = 0;

for (const country of allCountries) {
  const states = State.getStatesOfCountry(country.isoCode) || [];
  if (!states.length) continue;

  writeJson(
    path.join(statesDir, `${country.isoCode}.json`),
    states
      .map((s) => ({ code: s.isoCode, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  stateFileCount += 1;

  const countryCitiesDir = path.join(citiesDir, country.isoCode);
  for (const state of states) {
    const cities = City.getCitiesOfState(country.isoCode, state.isoCode) || [];
    if (!cities.length) continue;

    ensureDir(countryCitiesDir);
    writeJson(
      path.join(countryCitiesDir, `${state.isoCode}.json`),
      cities.map((c) => c.name).sort((a, b) => a.localeCompare(b)),
    );
    cityFileCount += 1;
    totalCities += cities.length;
  }
}

console.log(`✓ states/ (${stateFileCount} country files)`);
console.log(`✓ cities/ (${cityFileCount} state files, ${totalCities} cities)`);
console.log("\nDone. Offline location datasets written to public/data/");

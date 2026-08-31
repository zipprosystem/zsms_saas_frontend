/** Offline location dataset types — see public/data/*.json and scripts/generate-location-data.mjs. */

export type LocationCountry = {
  code: string;
  name: string;
  /** Dial code, no leading '+' (e.g. "234"). */
  phone: string;
  currency: string;
  timezones: string[];
  flag: string;
};

export type LocationState = {
  code: string;
  name: string;
};

"use server";

import { cookies } from "next/headers";
import { locales, type Locale } from "@/i18n/request";

export async function setLocale(locale: Locale) {
  if (!locales.includes(locale)) {
    return;
  }

  cookies().set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

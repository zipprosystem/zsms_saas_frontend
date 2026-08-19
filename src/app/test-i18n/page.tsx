import { getLocale, getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "./locale-switcher";
import type { Locale } from "@/i18n/request";

const commonKeys = [
  "signIn",
  "signInToYourAccount",
  "username",
  "password",
  "forgotPassword",
  "clickHere",
] as const;

export default async function TestI18nPage() {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;

  return (
    <main className="min-h-screen bg-background p-8 text-text-primary">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-semibold">
          i18n Test — {locale.toUpperCase()}
        </h1>
        <LocaleSwitcher currentLocale={locale} />
      </div>

      <section className="mb-10 rounded-lg border border-border bg-surface p-6">
        <h2 className="font-display mb-1 text-2xl font-semibold">
          {t("welcome.welcomeBack")}
        </h2>
        <p className="text-text-secondary">{t("welcome.tagline")}</p>
      </section>

      <section>
        <h2 className="font-display mb-4 text-xl font-semibold">
          common namespace
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {commonKeys.map((key) => (
            <div
              key={key}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <p className="text-xs text-text-muted">common.{key}</p>
              <p className="mt-1 text-text-primary">
                {t(`common.${key}`)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

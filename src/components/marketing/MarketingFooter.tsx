import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function MarketingFooter() {
  const t = await getTranslations("marketing.footer");
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-text-primary">{t("wordmark")}</p>

        <nav className="flex flex-wrap gap-6 text-sm text-text-secondary">
          <a href="#features" className="transition-colors hover:text-text-primary">
            {t("features")}
          </a>
          <a href="#pricing" className="transition-colors hover:text-text-primary">
            {t("pricing")}
          </a>
          <Link href="/onboarding" className="transition-colors hover:text-text-primary">
            {t("signUp")}
          </Link>
          <a href="mailto:support@zsmsapp.com" className="transition-colors hover:text-text-primary">
            {t("contact")}
          </a>
        </nav>
      </div>

      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-1 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          {t.rich("builtBy", {
            company: "Zippro System Limited",
            link: (chunks) => (
              <a
                href="https://zipprosystem.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy underline underline-offset-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <p>{t("rights", { year, company: "Zippro System Limited" })}</p>
      </div>
    </footer>
  );
}

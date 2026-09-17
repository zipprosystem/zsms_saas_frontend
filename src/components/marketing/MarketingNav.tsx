import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";

export async function MarketingNav() {
  const t = await getTranslations("marketing.nav");

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-6">
        <Link href="/landing" aria-label="Zippro">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG source, next/image's optimizer rejects SVG without a next.config change */}
          <img src="/logo.svg" alt="Zippro" width={110} height={50} />
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium text-text-secondary sm:flex">
          <a href="#features" className="transition-colors hover:text-text-primary">
            {t("features")}
          </a>
          <a href="#pricing" className="transition-colors hover:text-text-primary">
            {t("pricing")}
          </a>
        </nav>

        <MarketingCtaLink href="/onboarding" className="h-10 px-5 text-sm">
          {t("signUp")}
        </MarketingCtaLink>
      </div>
    </header>
  );
}

import { getTranslations } from "next-intl/server";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";

// The hero's "breadth" device: every module ZSMS covers, listed for real —
// not a decorative icon grid. Order roughly follows the feature groups below.
const MANIFEST_MODULE_KEYS = [
  "academics",
  "examinations",
  "library",
  "aiAssistant",
  "students",
  "admissions",
  "attendance",
  "parentPortal",
  "hr",
  "financeAdmin",
  "inventory",
  "clinic",
  "facilities",
  "communications",
  "messages",
  "conducts",
  "reports",
  "websiteCms",
  "adminPanel",
] as const;

export async function MarketingHero() {
  const t = await getTranslations("marketing.hero");
  const tModules = await getTranslations("marketing.modules");

  return (
    <section className="bg-navy">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 motion-safe:animate-hero-in md:grid-cols-[1.1fr_1fr] md:items-center md:py-28">
        <div>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            {t("headline")}
          </h1>
          <p className="mt-6 max-w-lg text-lg text-white/70">{t("subhead")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-6">
            <MarketingCtaLink href="/onboarding">{t("primaryCta")}</MarketingCtaLink>
            <a
              href="#features"
              className="text-sm font-medium text-white/80 underline underline-offset-4 transition-colors hover:text-white"
            >
              {t("secondaryCta")}
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-white/15 bg-white/5 p-6">
          <p className="text-sm font-medium text-white/50">{t("manifestLabel")}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {MANIFEST_MODULE_KEYS.map((key) => (
              <li
                key={key}
                className="rounded-sm border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/90"
              >
                {tModules(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

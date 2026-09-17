import { getTranslations } from "next-intl/server";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { MarketingCtaLink } from "@/components/marketing/MarketingCtaLink";

// Minimum student count is uniform across every plan per Matthew (2026-09-16),
// overriding the per-plan minimums in the original pricing brief.
const MINIMUM_STUDENTS = 20;

const CURRENCY_SYMBOL: Record<"NGN" | "USD", string> = { NGN: "₦", USD: "$" };

const PLANS = [
  {
    key: "starter",
    currency: "NGN" as const,
    yearly: 3000,
    termly: 1000,
    modules: ["academics", "students", "attendance", "parentPortal", "examinations", "admissions"],
    moreCount: 0,
    recommended: false,
    global: false,
  },
  {
    key: "professional",
    currency: "NGN" as const,
    yearly: 5000,
    termly: 2000,
    modules: ["academics", "students", "admissions", "attendance", "examinations", "financeAdmin"],
    moreCount: 2,
    recommended: true,
    global: false,
  },
  {
    key: "enterprise",
    currency: "NGN" as const,
    yearly: 10000,
    termly: 4000,
    modules: ["academics", "students", "admissions", "attendance", "examinations", "financeAdmin"],
    moreCount: 4,
    recommended: false,
    global: false,
  },
  {
    key: "basicGlobal",
    currency: "USD" as const,
    yearly: 30,
    termly: 10,
    modules: ["examinations", "aiAssistant", "academics", "admissions", "attendance", "students"],
    moreCount: 4,
    recommended: false,
    global: true,
  },
] as const;

function formatPrice(currency: "NGN" | "USD", amount: number) {
  return `${CURRENCY_SYMBOL[currency]}${amount.toLocaleString("en-US")}`;
}

export async function MarketingPricing() {
  const t = await getTranslations("marketing.pricing");
  const tModules = await getTranslations("marketing.modules");

  return (
    <section id="pricing" className="bg-surface px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold text-text-primary sm:text-4xl">{t("heading")}</h2>
        <p className="mt-3 max-w-xl text-lg text-text-secondary">{t("subheading")}</p>

        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`flex flex-col rounded-lg border bg-background p-6 ${
                plan.recommended ? "border-border border-t-4 border-t-navy" : "border-border"
              }`}
            >
              {plan.recommended ? <p className="text-sm font-semibold text-navy">{t("recommended")}</p> : null}
              <h3 className="mt-1 text-xl font-semibold text-text-primary">{t(`plans.${plan.key}.name`)}</h3>
              {plan.global ? <p className="mt-1 text-sm text-text-muted">{t("globalNote")}</p> : null}

              <div className="mt-4">
                <p className="text-3xl font-semibold text-text-primary">
                  {formatPrice(plan.currency, plan.yearly)}
                  <span className="text-base font-normal text-text-secondary">{t("perYear")}</span>
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  {formatPrice(plan.currency, plan.termly)}
                  {t("perTerm")}
                </p>
              </div>

              <p className="mt-3 text-sm text-text-muted">{t("minimumStudents", { count: MINIMUM_STUDENTS })}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.modules.map((moduleKey) => (
                  <li key={moduleKey} className="flex items-center gap-2 text-sm text-text-secondary">
                    <CheckIcon className="h-4 w-4 shrink-0 text-accent-2" />
                    {tModules(moduleKey)}
                  </li>
                ))}
                {plan.moreCount > 0 ? (
                  <li className="pl-6 text-sm text-text-muted">{t("moreModules", { count: plan.moreCount })}</li>
                ) : null}
              </ul>

              <MarketingCtaLink href="/onboarding" className="mt-6 w-full">
                {t("cta")}
              </MarketingCtaLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

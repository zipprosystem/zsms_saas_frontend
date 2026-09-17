import { getTranslations } from "next-intl/server";

const GROUPS = [
  { key: "academicsLearning", modules: ["academics", "examinations", "library", "aiAssistant"] },
  { key: "studentsPeople", modules: ["students", "admissions", "attendance", "parentPortal", "hr"] },
  { key: "operationsFinance", modules: ["financeAdmin", "inventory", "clinic", "facilities"] },
  {
    key: "communicationOversight",
    modules: ["communications", "messages", "conducts", "reports", "websiteCms", "adminPanel"],
  },
] as const;

export async function MarketingFeatures() {
  const t = await getTranslations("marketing.features");
  const tGroups = await getTranslations("marketing.features.groups");
  const tModules = await getTranslations("marketing.modules");

  return (
    <section id="features" className="bg-background px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-3xl font-semibold text-text-primary sm:text-4xl">{t("heading")}</h2>
        <p className="mt-3 max-w-xl text-lg text-text-secondary">{t("subheading")}</p>

        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
          {GROUPS.map((group) => (
            <div key={group.key} className="border-l-2 border-navy pl-6">
              <h3 className="text-xl font-semibold text-text-primary">{tGroups(`${group.key}.title`)}</h3>
              <p className="mt-2 text-text-secondary">{tGroups(`${group.key}.description`)}</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {group.modules.map((moduleKey) => (
                  <li
                    key={moduleKey}
                    className="rounded-sm border border-border bg-surface px-2.5 py-1 text-sm text-text-secondary"
                  >
                    {tModules(moduleKey)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

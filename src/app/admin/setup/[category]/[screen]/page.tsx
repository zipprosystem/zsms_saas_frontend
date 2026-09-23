import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { resolveSetupRoute } from "@/lib/setup/setupConfig";
import { setupScreenRegistry } from "@/lib/setup/screenRegistry";

type PageProps = {
  params: Promise<{ category: string; screen: string }>;
};

export default async function SetupScreenPage({ params }: PageProps) {
  const { category: categorySlug, screen: screenSlug } = await params;
  const resolved = resolveSetupRoute(categorySlug, screenSlug);
  if (!resolved) notFound();

  const ScreenComponent = setupScreenRegistry[`${categorySlug}/${screenSlug}`];
  if (ScreenComponent) {
    return <ScreenComponent />;
  }

  const t = await getTranslations();
  const { category, item } = resolved;

  return (
    <div className="flex min-w-0 flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm sm:px-12">
      <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-accent">
        {t(category.name)}
      </span>
      <h1 className="mt-4 text-xl font-semibold text-text-primary">{t(item.name)}</h1>
      {item.description ? (
        <p className="mt-2 max-w-md text-sm text-text-muted">{t(item.description)}</p>
      ) : null}
      <p className="mt-8 text-sm font-medium text-text-secondary">{t("setup.stub.comingSoon")}</p>
    </div>
  );
}

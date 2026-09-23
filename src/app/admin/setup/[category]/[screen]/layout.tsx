import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { SetupShell } from "@/components/setup/SetupShell";
import { resolveSetupRoute, getShellCategories, setupCategories } from "@/lib/setup/setupConfig";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ category: string; screen: string }>;
};

export default async function SetupScreenLayout({ children, params }: LayoutProps) {
  const { category: categorySlug, screen: screenSlug } = await params;
  const resolved = resolveSetupRoute(categorySlug, screenSlug);
  if (!resolved) notFound();

  const t = await getTranslations();

  return (
    <SetupShell
      categories={getShellCategories(setupCategories)}
      activeCategory={resolved.category}
      activeScreenSlug={screenSlug}
      activeScreenName={t(resolved.item.name)}
    >
      {children}
    </SetupShell>
  );
}

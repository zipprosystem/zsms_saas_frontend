import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";
import { findSetupItemBySlug, setupCategories } from "@/lib/setup/setupConfig";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const match = findSetupItemBySlug(setupCategories, slug);

  if (!match) {
    notFound();
  }

  const { item, category } = match;
  const t = await getTranslations();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Link
        href="/admin/overview"
        className="mb-6 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
      >
        <ArrowRightIcon className="h-4 w-4 rotate-180" />
        {t("setup.stub.backToOverview")}
      </Link>

      <div className="flex min-w-0 flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm sm:px-12">
        <span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-accent">
          {t(category.name)}
        </span>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">
          {t(item.name)}
        </h1>
        {item.description && (
          <p className="mt-2 max-w-md text-sm text-text-muted">
            {t(item.description)}
          </p>
        )}
        <p className="mt-8 text-sm font-medium text-text-secondary">
          {t("setup.stub.comingSoon")}
        </p>
      </div>
    </div>
  );
}

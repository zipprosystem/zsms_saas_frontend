import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon } from "@/components/icons/ArrowRightIcon";

export default async function NotFound() {
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
        <h1 className="text-xl font-semibold text-text-primary">
          {t("setup.notFound.title")}
        </h1>
        <p className="mt-2 max-w-md text-sm text-text-muted">
          {t("setup.notFound.message")}
        </p>
      </div>
    </div>
  );
}

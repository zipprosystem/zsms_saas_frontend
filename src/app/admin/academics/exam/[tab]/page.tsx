import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EXAM_TABS } from "@/components/exam/examTabsConfig";

type PageProps = { params: Promise<{ tab: string }> };

/** Placeholder for the Exam tabs that aren't built yet (Results and Broad Sheet have their own routes). */
export default async function ExamTabStubPage({ params }: PageProps) {
  const { tab } = await params;
  const config = EXAM_TABS.find((item) => item.slug === tab && item.slug !== "results" && item.slug !== "broad-sheet");
  if (!config) notFound();
  const t = await getTranslations();
  return (
    <div className="flex min-w-0 flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-text-primary">{t(config.labelKey)}</h2>
      <p className="mt-2 text-sm text-text-muted">{t("common.comingSoon")}</p>
    </div>
  );
}

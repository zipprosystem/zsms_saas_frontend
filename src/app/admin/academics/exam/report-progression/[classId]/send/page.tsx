import { getTranslations } from "next-intl/server";
import { StagePlaceholder } from "@/components/exam/reportProgression/progressionShared";
import { reportProgressionClassHref } from "@/components/exam/examTabsConfig";

type PageProps = { params: Promise<{ classId: string }>; searchParams: Promise<{ term?: string; point?: string }> };

/** Send Result to Parent — STUB: the full surface is Report Progression Stage 4. */
export default async function Page({ params, searchParams }: PageProps) {
  const { classId } = await params;
  const { term, point } = await searchParams;
  const t = await getTranslations("exam.reportProgression");
  const query = new URLSearchParams();
  if (term) query.set("term", term);
  if (point) query.set("point", point);
  const back = `${reportProgressionClassHref(decodeURIComponent(classId))}${query.size ? `?${query}` : ""}`;
  return <StagePlaceholder backHref={back} backLabel={t("placeholder.backToClass")} title={t("placeholder.send.title")} body={t("placeholder.send.body")} />;
}

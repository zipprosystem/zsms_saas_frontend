import { getTranslations } from "next-intl/server";
import { StarburstIcon } from "@/components/icons/StarburstIcon";

export async function SetupHeader() {
  const t = await getTranslations("setup.header");

  return (
    <div className="relative flex min-w-0 items-center overflow-hidden rounded-[20px] bg-accent-2 px-5 py-6 sm:px-8 lg:min-h-[157px] lg:px-10">
      <StarburstIcon className="pointer-events-none absolute -right-4 -top-6 h-auto w-28 text-white/70 sm:w-40 lg:w-48" />
      <div className="relative min-w-0 max-w-full lg:max-w-none">
        <h1 className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl lg:whitespace-nowrap lg:text-[40px]">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-white/90">{t("subtitle")}</p>
      </div>
    </div>
  );
}

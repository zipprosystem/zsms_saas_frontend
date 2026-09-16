import { getTranslations } from "next-intl/server";

export default async function TenantInvalidNotFound() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center rounded-xl border border-border bg-surface px-6 py-16 text-center shadow-sm sm:px-12">
        <h1 className="text-xl font-semibold text-text-primary">{t("tenant.invalid.title")}</h1>
        <p className="mt-2 max-w-md text-sm text-text-muted">{t("tenant.invalid.message")}</p>
      </div>
    </main>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/actions/set-locale";
import type { Locale } from "@/i18n/request";

export function LocaleSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSetLocale = (locale: Locale) => {
    startTransition(async () => {
      await setLocale(locale);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleSetLocale("en")}
        disabled={isPending}
        className={
          currentLocale === "en"
            ? "rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors disabled:opacity-50"
            : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-50"
        }
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => handleSetLocale("fr")}
        disabled={isPending}
        className={
          currentLocale === "fr"
            ? "rounded-md border border-border bg-accent px-3 py-1.5 text-sm font-medium text-on-accent transition-colors disabled:opacity-50"
            : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-primary transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-50"
        }
      >
        FR
      </button>
    </div>
  );
}

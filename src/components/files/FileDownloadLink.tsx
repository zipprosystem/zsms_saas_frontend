"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/ui/Toast";
import { getDownloadUrl } from "@/lib/files/filesApi";

/**
 * Download action for a stored file_id. The signed URL (TTL 300s) is
 * fetched fresh on EVERY click and never kept — see filesApi.ts.
 *
 * The new tab is opened synchronously inside the click (before the await)
 * so popup blockers treat it as user-initiated, then pointed at the signed
 * URL once it arrives; on failure it's closed again and a toast explains.
 */
export function FileDownloadLink({
  fileId,
  children,
  className,
}: {
  fileId: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations();
  const { showToast } = useToast();
  const [isFetching, setIsFetching] = useState(false);

  const handleClick = async () => {
    const tab = window.open("", "_blank");
    setIsFetching(true);
    const result = await getDownloadUrl(fileId);
    setIsFetching(false);

    if (result.ok) {
      if (tab) {
        tab.opener = null;
        tab.location.href = result.data;
      } else {
        window.location.assign(result.data);
      }
      return;
    }

    tab?.close();
    showToast(
      result.kind === "devBypassUnavailable"
        ? t("setup.crudScreen.errors.devBypassUnavailable")
        : t("files.downloadFailed"),
      "error",
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isFetching}
      aria-busy={isFetching}
      className={`text-left disabled:opacity-60 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

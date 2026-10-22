"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useFileImageUrl } from "@/lib/files/useFileImageUrl";
import type { Staff, StaffStatus } from "@/lib/hr/hrTypes";

// Semantic tokens only (dark-mode safe) — same palette as StudentStatusBadge.
const STATUS_CLASSES: Record<StaffStatus, string> = {
  active: "bg-category-green-tint text-success",
  draft: "bg-category-amber-tint text-warning",
  suspended: "bg-category-amber-tint text-warning",
  retired: "border border-border text-text-secondary",
  resigned: "border border-border text-text-secondary",
  terminated: "border border-error text-error",
  absconded: "border border-error text-error",
};

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  const t = useTranslations();
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_CLASSES[status]}`}
    >
      {t(`hr.staffs.status.${status}`)}
    </span>
  );
}

/** Passport photo (a files-service id) with an initials fallback — same behaviour as StudentAvatar. */
export function StaffAvatar({ staff }: { staff: Pick<Staff, "photo_file_id" | "first_name" | "last_name"> }) {
  const url = useFileImageUrl(staff.photo_file_id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (url && url !== failedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL, not an optimizable static asset
      <img
        src={url}
        alt=""
        onError={() => setFailedUrl(url)}
        className="h-9 w-9 shrink-0 rounded-full bg-accent-2 object-cover"
      />
    );
  }

  const initials = `${staff.first_name[0] ?? ""}${staff.last_name[0] ?? ""}`.toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-2 text-xs font-semibold text-accent">
      {initials || "—"}
    </span>
  );
}

const CHIP_CLASSES = [
  "bg-category-blue-tint text-category-blue",
  "bg-category-amber-tint text-category-amber",
  "bg-category-green-tint text-category-green",
  "bg-category-cyan-tint text-category-cyan",
  "bg-category-purple-tint text-category-purple",
];

/** Class-arm chip. Colour keyed by the class's position, so every arm of one class shares a colour (as in the Figma). */
export function ClassArmChip({ label, colorIndex }: { label: string; colorIndex: number }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
        CHIP_CLASSES[((colorIndex % CHIP_CLASSES.length) + CHIP_CLASSES.length) % CHIP_CLASSES.length]
      }`}
    >
      {label}
    </span>
  );
}

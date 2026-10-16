"use client";

import { useState } from "react";
import { useFileImageUrl } from "@/lib/files/useFileImageUrl";
import type { Student } from "@/lib/students/studentTypes";

/**
 * List-row avatar. photo_file_id is a POST /files id (purpose
 * student_photo), resolved to an image by useFileImageUrl. Falls back to
 * initials when there's no photo, while the URL loads, or if the URL or
 * the image fails (including the local dev bypass).
 */
export function StudentAvatar({ student }: { student: Student }) {
  const url = useFileImageUrl(student.photo_file_id);
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

  const initials = `${student.first_name[0] ?? ""}${student.last_name[0] ?? ""}`.toUpperCase();
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-2 text-xs font-semibold text-accent">
      {initials || "—"}
    </span>
  );
}

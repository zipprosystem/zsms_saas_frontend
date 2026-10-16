"use client";

import { useQuery } from "@tanstack/react-query";
import { getDownloadUrl } from "@/lib/files/filesApi";

/**
 * Signed download URLs live 300s (filesApi.ts). An <img> uses its URL the
 * moment it renders and the browser keeps the loaded image, so a short
 * cache is safe here, unlike FileDownloadLink where a stale URL would be
 * handed to the user. Kept under the TTL so a remount never reuses an
 * expired URL, and it stops paging back and forth through a list from
 * re-fetching every row.
 */
const IMAGE_URL_CACHE_MS = 4 * 60 * 1000;

/**
 * Resolves a stored file id (e.g. photo_file_id) to an <img>-ready signed
 * URL via GET /files/:id/download-url, the same endpoint past-record
 * attachments use. Null when there's no id, while loading, or on any
 * failure (including the local dev bypass). Never retried: a missing image
 * isn't worth repeat calls. Shared by StudentAvatar and AvatarUploadField.
 */
export function useFileImageUrl(fileId: string | null | undefined): string | null {
  const query = useQuery({
    queryKey: ["files", "downloadUrl", fileId],
    queryFn: () => getDownloadUrl(fileId as string),
    enabled: !!fileId,
    staleTime: IMAGE_URL_CACHE_MS,
    gcTime: IMAGE_URL_CACHE_MS,
    retry: false,
  });
  return query.data?.ok ? query.data.data : null;
}

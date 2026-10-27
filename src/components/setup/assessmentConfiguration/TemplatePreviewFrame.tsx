"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";

/** Which card of id-card-templates.html to show — that one design file holds both. */
export type PreviewFocus = "student" | "staff";

/**
 * Hides everything in the ID-card design file except the requested card
 * (front + back). Tied to that file's own markup: the student card is the
 * `.group` holding `.s-front`, the staff card the one holding `.t-front`.
 */
const FOCUS_CSS: Record<PreviewFocus, string> = {
  student: ".intro,.group:not(:has(.s-front)){display:none!important}",
  staff: ".intro,.group:not(:has(.t-front)){display:none!important}",
};

/** Thumbnails drop the design files' on-screen chrome (variant toggles, intro note). */
const THUMBNAIL_CSS = ".toolbar,.intro{display:none!important}";

/**
 * The design files are standalone pages. Rendering them via srcdoc in a
 * sandboxed iframe keeps their CSS out of the app (and the app's tokens
 * out of them). `data-theme="light"` pins them to their light palette —
 * a report card/ID card is a print artifact, so it previews as printed
 * regardless of the app's dark mode. The override <style> is appended so
 * it wins the cascade.
 */
function buildSrcDoc(html: string, focus: PreviewFocus | undefined, variant: "thumbnail" | "full"): string {
  const css = [focus ? FOCUS_CSS[focus] : "", variant === "thumbnail" ? THUMBNAIL_CSS : ""].join("");
  return `<!doctype html><html data-theme="light">${html}<style>${css}</style>`;
}

/** The design file's HTML — shared (and cached under one query key) with the report viewer. */
export async function fetchPreviewHtml(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Preview ${response.status}`);
  return response.text();
}

export function templateHtmlQueryKey(path: string | null): readonly unknown[] {
  return ["templatePreviewHtml", path];
}

/** Keeps a fixed virtual viewport scaled to the container's width. */
function useScaleToWidth(virtualWidth: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / virtualWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualWidth]);

  return { containerRef, scale };
}

type TemplatePreviewFrameProps = {
  previewPath: string | null;
  title: string;
  focus?: PreviewFocus;
  /**
   * "thumbnail": the design rendered at `virtualWidth` and scaled down to
   * fit the card, non-interactive. "full": real size, scrollable, with
   * the design's own variant toggles.
   */
  variant: "thumbnail" | "full";
  /** CSS px the design is laid out at before scaling (thumbnail only). */
  virtualWidth?: number;
};

export function TemplatePreviewFrame({ previewPath, title, focus, variant, virtualWidth = 1200 }: TemplatePreviewFrameProps) {
  const t = useTranslations();
  const { containerRef, scale } = useScaleToWidth(virtualWidth);
  const query = useQuery({
    queryKey: templateHtmlQueryKey(previewPath),
    queryFn: () => fetchPreviewHtml(previewPath as string),
    enabled: !!previewPath,
    staleTime: Infinity,
    retry: false,
  });

  // sandbox without allow-same-origin: the design's own scripts (QR
  // placeholder, rating pips, variant toggles) run, but in an opaque
  // origin with no access to the app, its storage or its cookies.
  const srcDoc = query.data ? buildSrcDoc(query.data, focus, variant) : null;
  const status = !previewPath
    ? t("setup.templateCatalog.preview.none")
    : query.isError
      ? t("setup.templateCatalog.preview.loadError")
      : !srcDoc
        ? t("setup.templateCatalog.preview.loading")
        : null;

  if (variant === "full") {
    return srcDoc ? (
      <iframe title={title} srcDoc={srcDoc} sandbox="allow-scripts" className="h-[70vh] w-full rounded-lg border border-border" />
    ) : (
      <div className="flex h-[70vh] w-full items-center justify-center rounded-lg bg-background text-sm text-text-muted">{status}</div>
    );
  }

  // Always mounted (it's what useScaleToWidth measures): a 4:3 window onto
  // the top of the design, laid out at virtualWidth × (virtualWidth × 3/4).
  return (
    <div ref={containerRef} className="relative aspect-[4/3] w-full overflow-hidden bg-background">
      {srcDoc && scale > 0 ? (
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: virtualWidth, height: (virtualWidth * 3) / 4, transform: `scale(${scale})` }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">{status}</div>
      )}
    </div>
  );
}

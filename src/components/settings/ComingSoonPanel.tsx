"use client";

import { useTranslations } from "next-intl";
import { SlideOverPanel } from "@/components/ui/SlideOverPanel";
import { Button } from "@/components/ui/Button";

type ComingSoonPanelProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
};

/**
 * Shared placeholder edit panel for sections that don't have a working
 * editor yet. Proves the SlideOverPanel pattern is reusable across every
 * section while every "Edit" button opens something.
 */
export function ComingSoonPanel({ isOpen, title, onClose }: ComingSoonPanelProps) {
  const t = useTranslations();

  return (
    <SlideOverPanel
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={t("settings.comingSoonPanel.subtitle")}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <p className="text-sm text-text-secondary">{t("settings.comingSoonPanel.body")}</p>
    </SlideOverPanel>
  );
}

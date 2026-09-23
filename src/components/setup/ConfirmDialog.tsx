"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  message: string;
  isDangerous?: boolean;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Small centered confirm modal, shared by every CRUD screen for its
 * destructive actions (delete, and any custom action a screen marks with
 * `confirm` on its RowAction) — a native window.confirm() would look out
 * of place in an otherwise designed admin UI, and this is a one-time cost
 * for all ~29 screens.
 */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  isDangerous,
  isConfirming,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-xl bg-surface p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-text-primary">
          {title}
        </h2>
        <p className="text-sm text-text-secondary">{message}</p>
        <div className="mt-2 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel} className="h-10 px-4 text-sm">
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isConfirming}
            className={`h-10 px-4 text-sm ${isDangerous ? "bg-error hover:bg-error/90" : ""}`}
          >
            {isConfirming ? t("common.saving") : t("common.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

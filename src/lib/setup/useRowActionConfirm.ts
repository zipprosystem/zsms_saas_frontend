import { useState } from "react";
import type { RowAction } from "@/lib/setup/crudTypes";

/**
 * Confirm-before-run for row actions, shared by DataTable and CardGrid
 * (both need identical behavior for any RowAction that sets `confirm` —
 * this used to live only inside DataTable; extracted so CardGrid doesn't
 * duplicate it). `confirm` is a property of the generic RowAction contract,
 * so any screen's any action gets this automatically just by setting it.
 */
export function useRowActionConfirm<T>() {
  const [pending, setPending] = useState<{ action: RowAction<T>; row: T } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const handleActionClick = (row: T, action: RowAction<T>) => {
    if (action.confirm) {
      setPending({ action, row });
    } else {
      action.onClick(row);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    setIsRunning(true);
    await pending.action.onClick(pending.row);
    setIsRunning(false);
    setPending(null);
  };

  const cancel = () => setPending(null);

  return { pending, isRunning, handleActionClick, handleConfirm, cancel };
}

"use client";

import { useTranslations } from "next-intl";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  permissionKey,
  type PermissionModule,
} from "@/lib/hr/permissionCatalog";

type PermissionMatrixProps = {
  value: string[];
  onChange: (permissions: string[]) => void;
};

/** Module × action checkbox grid. A row's own checkbox toggles that whole module. Scrolls sideways on narrow screens rather than squashing. */
export function PermissionMatrix({ value, onChange }: PermissionMatrixProps) {
  const t = useTranslations();
  const selected = new Set(value);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  const moduleKeys = (module: PermissionModule) => PERMISSION_ACTIONS.map((action) => permissionKey(module, action));

  const toggleModule = (module: PermissionModule) => {
    const keys = moduleKeys(module);
    const allOn = keys.every((key) => selected.has(key));
    const next = new Set(selected);
    for (const key of keys) {
      if (allOn) next.delete(key);
      else next.add(key);
    }
    onChange(Array.from(next));
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-text-primary">{t("hr.permissionGroups.fields.permissions.label")}</legend>
      <p className="-mt-1 text-xs text-text-muted">{t("hr.permissionGroups.fields.permissions.helper")}</p>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                {t("hr.permissionGroups.fields.permissions.module")}
              </th>
              {PERMISSION_ACTIONS.map((action) => (
                <th key={action} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {t(`hr.permissions.actions.${action}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MODULES.map((module) => {
              const keys = moduleKeys(module);
              const onCount = keys.filter((key) => selected.has(key)).length;
              return (
                <tr key={module} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2.5 text-text-primary">
                      <input
                        type="checkbox"
                        checked={onCount === keys.length}
                        ref={(node) => {
                          if (node) node.indeterminate = onCount > 0 && onCount < keys.length;
                        }}
                        onChange={() => toggleModule(module)}
                        className="h-4 w-4 shrink-0 rounded border-border accent-accent"
                      />
                      {t(`hr.permissions.modules.${module}`)}
                    </label>
                  </td>
                  {PERMISSION_ACTIONS.map((action) => {
                    const key = permissionKey(module, action);
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${t(`hr.permissions.modules.${module}`)} — ${t(`hr.permissions.actions.${action}`)}`}
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          className="h-4 w-4 rounded border-border accent-accent"
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

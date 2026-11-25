"use client";

import { useTranslations } from "next-intl";
import { isPrimaryParentOf } from "@/lib/parents/parentLinks";
import type { ParentListItem } from "@/lib/parents/parentTypes";
import { useParentChildren, useParentRecord, type ChildLookup } from "@/components/parents/useParentData";

/** Chips shown inline before collapsing into "+N more". */
const INLINE_CHILDREN = 3;

export function ChildChip({ lookup, isPrimary }: { lookup: ChildLookup; isPrimary: boolean }) {
  const t = useTranslations("parents");
  if (lookup.isLoading) return <span className="h-5 w-20 animate-pulse rounded-full bg-background" aria-hidden />;
  const label = lookup.child?.full_name || t("children.unavailable");
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        lookup.child ? "bg-category-blue-tint text-category-blue" : "border border-border text-text-muted"
      }`}
      title={isPrimary ? t("children.primaryFor", { name: label }) : lookup.child?.student_no ?? undefined}
    >
      <span className="truncate">{label}</span>
      {isPrimary ? (
        <span aria-label={t("primary.label")} className="text-category-amber">
          ★
        </span>
      ) : null}
    </span>
  );
}

/**
 * List cell: the parent's linked students (siblings grouped under the one
 * parent). GET erp/parents only carries total_kids, so the ids come from
 * the parent's detail and the names from Student Core, both cached —
 * FLAGGED as the main backend ask (embed the children in list items).
 */
export function ParentChildrenCell({ parent }: { parent: ParentListItem }) {
  const t = useTranslations("parents");
  const hasKids = parent.total_kids > 0;
  const record = useParentRecord(parent.id, hasKids);
  const ids = record.data?.ok ? record.data.data.student_ids : [];
  const lookups = useParentChildren(ids);

  if (!hasKids) return <span className="text-xs text-text-muted">{t("children.none")}</span>;
  if (record.isPending) return <span className="h-5 w-24 animate-pulse rounded-full bg-background" aria-hidden />;
  // Degrade: the count is still known even if the detail call failed.
  if (!record.data?.ok) return <span className="text-xs text-text-secondary">{t("children.count", { count: parent.total_kids })}</span>;

  const shown = lookups.slice(0, INLINE_CHILDREN);
  const more = lookups.length - shown.length;
  return (
    <div className="flex min-w-[160px] max-w-[280px] flex-wrap gap-1">
      {shown.map((lookup) => (
        <ChildChip key={lookup.id} lookup={lookup} isPrimary={!!lookup.child && isPrimaryParentOf(parent, lookup.child)} />
      ))}
      {more > 0 ? <span className="text-[11px] font-medium text-text-muted">{t("children.more", { count: more })}</span> : null}
    </div>
  );
}

/** "Primary for N of M" — the list's primary-parent indicator, from the same cached lookups. */
export function PrimaryForCell({ parent }: { parent: ParentListItem }) {
  const t = useTranslations("parents");
  const hasKids = parent.total_kids > 0;
  const record = useParentRecord(parent.id, hasKids);
  const ids = record.data?.ok ? record.data.data.student_ids : [];
  const lookups = useParentChildren(ids);
  if (!hasKids || !record.data?.ok) return <span className="text-xs text-text-muted">—</span>;
  if (lookups.some((lookup) => lookup.isLoading)) return <span className="h-4 w-10 animate-pulse rounded bg-background" aria-hidden />;
  const primaryCount = lookups.filter((lookup) => lookup.child && isPrimaryParentOf(parent, lookup.child)).length;
  if (primaryCount === 0) return <span className="text-xs text-text-muted">{t("primary.none")}</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-text-primary">
      <span aria-hidden className="text-category-amber">
        ★
      </span>
      {primaryCount === lookups.length ? t("primary.forAll") : t("primary.forSome", { count: primaryCount, total: lookups.length })}
    </span>
  );
}

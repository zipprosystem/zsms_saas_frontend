import type { ParentChild, ParentRelationship } from "@/lib/parents/parentTypes";

/**
 * Pure rules shared by the Parent page and its dev mock.
 *
 * PRIMARY PARENT — FLAGGED (derived until the backend exposes it):
 * parent_student.is_primary exists in the database (one primary per
 * student, owned by the student profile's "primary contact" tick), but
 * neither GET erp/parents nor GET erp/parents/:id returns it. Until it
 * does, the page derives it from the student record the same way the
 * backend's registration upsert matches a guardian block to a parent:
 * the student's primary_contact block names the parent by EMAIL
 * (case-insensitive) when the block has one, otherwise by exact full
 * name + relationship (father/mother -> parent, guardian -> guardian).
 * Swap point: when the detail response carries per-link is_primary,
 * read it in parentsApi.ts and drop isPrimaryParentOf().
 */

/** "first middle last", trimmed — the backend's composeParentFullName. */
export function composePersonName(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  return left !== "" && left === (b ?? "").trim().toLowerCase();
}

/** Is `parent` the primary contact the student's own profile names? */
export function isPrimaryParentOf(
  parent: { email: string | null; full_name: string; relationship: ParentRelationship },
  child: ParentChild,
): boolean {
  const role = child.primary_contact;
  if (!role) return false;
  const block = child.guardians[role];
  if (!block) return false;
  if (block.email?.trim()) return sameText(block.email, parent.email);
  const roleRelationship: ParentRelationship = role === "guardian" ? "guardian" : "parent";
  return roleRelationship === parent.relationship && sameText(block.full_name, parent.full_name);
}

const PLACEHOLDER_EMAIL_SUFFIXES = ["@invalid.local", "@invalid.example", "@localhost", "@example.com", "@example.net", "@example.org"];
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The backend's isDeliverableParentEmail (spec D3), mirrored ONLY for the
 * dev mock and the form's live hint — the server's email_active on the
 * saved record is always what the page displays.
 */
export function looksDeliverableEmail(email: string | null | undefined): boolean {
  const value = (email ?? "").trim().toLowerCase();
  if (!value || !EMAIL_SHAPE.test(value)) return false;
  if (value.endsWith(".local")) return false;
  return !PLACEHOLDER_EMAIL_SUFFIXES.some((suffix) => value.endsWith(suffix));
}

/** Two-letter initials for the avatar bubble. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

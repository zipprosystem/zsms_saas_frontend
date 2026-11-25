/**
 * Parents (Admin Panel › Parents) — wire shape of Muntajir's REAL Parent
 * CRUD (backend main, Migration 040 `parent` + `parent_student`,
 * src/modules/parents; docs/Parent-Module-Spec.md v1.2). snake_case, ERP
 * envelope, same conventions as Student Core. parentsApi.ts's fromWire()
 * is the only place this shape meets the network.
 */

export const PARENT_RELATIONSHIPS = ["parent", "guardian"] as const;
export type ParentRelationship = (typeof PARENT_RELATIONSHIPS)[number];

export const PARENT_STATUSES = ["active", "inactive"] as const;
export type ParentStatus = (typeof PARENT_STATUSES)[number];

/** Who made the record: the student-registration upsert, or the Parent page. */
export type ParentCreatedFrom = "student_registration" | "manual";

/** Spec §1 address — every key optional/nullable on the wire. */
export const PARENT_ADDRESS_KEYS = [
  "address",
  "city",
  "state",
  "country",
  "postal_code",
  "call_line",
  "contact_name_1",
  "contact_name_2",
  "contact_name_3",
] as const;
export type ParentAddressKey = (typeof PARENT_ADDRESS_KEYS)[number];
export type ParentAddress = Record<ParentAddressKey, string | null>;

/** GET erp/parents item — the list carries a COUNT of children, never the children themselves. */
export type ParentListItem = {
  id: string;
  full_name: string;
  relationship: ParentRelationship;
  total_kids: number;
  email: string | null;
  phone: string | null;
  status: ParentStatus;
  /** Server-derived (spec D3): the email is a real, deliverable address. Never sent by the client. */
  email_active: boolean;
};

/** GET erp/parents/:id — the record plus the linked student ids (no per-link is_primary yet; see parentLinks.ts). */
export type Parent = ParentListItem & {
  phone: string | null;
  occupation: string | null;
  date_of_birth: string | null;
  wedding_anniversary: string | null;
  present_address: ParentAddress;
  other_address: ParentAddress;
  created_from: ParentCreatedFrom;
  username: string;
  student_ids: string[];
  created_at: string;
  updated_at: string;
};

/**
 * POST / PUT body. PUT sends the COMPLETE form (every field), so a blank
 * field clears it. `student_ids` REPLACES the parent's whole set of links
 * (the backend's replaceChildren): ids dropped from it are unlinked, new
 * ones linked with is_primary=false, kept ones keep their is_primary.
 * `email_active` is never sent (server-derived).
 */
export type ParentWriteBody = {
  relationship: ParentRelationship;
  full_name: string;
  email: string | null;
  phone: string | null;
  occupation: string | null;
  date_of_birth: string | null;
  wedding_anniversary: string | null;
  present_address: ParentAddress;
  other_address: ParentAddress;
  /** Blank on create -> backend defaults it to the email (or a generated handle). Required on update. */
  username: string | null;
  status: ParentStatus;
  student_ids: string[];
};

/**
 * A linked student, as the Parent page shows it — resolved from Student
 * Core (GET erp/students/:id), because the Parent API returns bare ids.
 * `guardians` is the student's own parent/guardian blocks: the only place
 * the primary contact is visible to the frontend today (parentLinks.ts).
 */
export type ParentChild = {
  id: string;
  full_name: string;
  /** Backend-assigned display id (e.g. STU/2026/0001); null on a draft. */
  student_no: string | null;
  status: string;
  primary_contact: "father" | "mother" | "guardian" | null;
  guardians: Partial<Record<"father" | "mother" | "guardian", { full_name: string; email: string | null }>>;
};

/** A student search hit for the link picker / child filter. */
export type StudentOption = { id: string; full_name: string; student_no: string | null };

export function emptyParentAddress(): ParentAddress {
  return Object.fromEntries(PARENT_ADDRESS_KEYS.map((key) => [key, null])) as ParentAddress;
}

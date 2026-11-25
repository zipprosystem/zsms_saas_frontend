import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { HttpMethod, WireResponse } from "@/lib/setup/assessmentConfiguration/templateCatalog";
import { composePersonName, looksDeliverableEmail } from "@/lib/parents/parentLinks";
import { PARENT_ADDRESS_KEYS, emptyParentAddress, type ParentAddress } from "@/lib/parents/parentTypes";

/**
 * THROWAWAY dev scaffolding — used ONLY under DEV_AUTH_BYPASS (see
 * parentsApi.ts), so the Parent page can be exercised locally. Production
 * and staging never load it. It follows the REAL backend's rules
 * (src/modules/parents/parents.service.ts, Migration 040):
 *   - email unique (case-insensitive) among live parents -> 409 EMAIL_TAKEN
 *   - username unique -> 409 USERNAME_TAKEN; defaults to the email, else a
 *     generated "p.<12 hex>" handle
 *   - email_active derived from the email on every write (never accepted)
 *   - student_ids on POST/PUT REPLACES the links (new = is_primary false,
 *     kept links keep is_primary); unknown student -> 404 STUDENT_NOT_FOUND
 *   - DELETE is a soft delete; links are left behind, like the backend
 * The seed mimics what the registration upsert produces: one parent per
 * email shared across siblings, one primary per student, a dummy-email
 * parent (not mailable), a no-email guardian (generated username), a
 * manually-added grandparent, and two students with no parent links yet
 * (registered before Migration 040, which doesn't backfill).
 * Generic sample people — no real school or family. Emails use the
 * reserved .test domain.
 */
const STORAGE_KEY = "zsms.devMockParents.v1";

type Block = { first_name: string; middle_name: string | null; last_name: string; phone: string; email: string | null; occupation: string | null };
type MockStudent = {
  id: string;
  student_id: string;
  status: string;
  first_name: string;
  other_names: string | null;
  last_name: string;
  relationship_type: "parent" | "guardian";
  father: Block | null;
  mother: Block | null;
  guardian: Block | null;
  primary_contact: "father" | "mother" | "guardian" | null;
};
type MockParent = {
  id: string;
  relationship: "parent" | "guardian";
  full_name: string;
  phone: string | null;
  occupation: string | null;
  date_of_birth: string | null;
  wedding_anniversary: string | null;
  present_address: ParentAddress;
  other_address: ParentAddress;
  status: "active" | "inactive";
  created_from: "student_registration" | "manual";
  email: string | null;
  username: string;
  email_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type MockLink = { parent_id: string; student_id: string; is_primary: boolean; created_at: string };
type Db = { students: MockStudent[]; parents: MockParent[]; links: MockLink[] };

const SEED_AT = "2026-09-08T08:00:00.000Z";

function block(first: string, last: string, phone: string, email: string | null, occupation: string | null = null): Block {
  return { first_name: first, middle_name: null, last_name: last, phone, email, occupation };
}

function student(
  n: number,
  first: string,
  last: string,
  people: Partial<Record<"father" | "mother" | "guardian", Block>>,
  primary: MockStudent["primary_contact"],
): MockStudent {
  const id = `00000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  return {
    id,
    student_id: `STU/2026/${String(n).padStart(4, "0")}`,
    status: "active",
    first_name: first,
    other_names: null,
    last_name: last,
    relationship_type: people.guardian ? "guardian" : "parent",
    father: people.father ?? null,
    mother: people.mother ?? null,
    guardian: people.guardian ?? null,
    primary_contact: primary,
  };
}

function address(street: string, city: string): ParentAddress {
  return { ...emptyParentAddress(), address: street, city, state: "Lagos", country: "Nigeria" };
}

function parent(
  n: number,
  relationship: MockParent["relationship"],
  full_name: string,
  email: string | null,
  phone: string | null,
  extra: Partial<MockParent> = {},
): MockParent {
  const id = `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  return {
    id,
    relationship,
    full_name,
    phone,
    occupation: null,
    date_of_birth: null,
    wedding_anniversary: null,
    present_address: emptyParentAddress(),
    other_address: emptyParentAddress(),
    status: "active",
    created_from: "student_registration",
    email,
    username: email ?? generatedUsername(id),
    email_active: looksDeliverableEmail(email),
    created_at: SEED_AT,
    updated_at: SEED_AT,
    deleted_at: null,
    ...extra,
  };
}

function generatedUsername(id: string): string {
  return `p.${id.replace(/-/g, "").slice(0, 12)}`;
}

function seed(): Db {
  const obinna = block("Obinna", "Okafor", "+234 803 000 1001", "obinna.okafor@family.test", "Engineer");
  const chiamaka = block("Chiamaka", "Okafor", "+234 803 000 1002", "chiamaka.okafor@family.test", "Pharmacist");
  const funke = block("Funke", "Adeyemi", "+234 805 000 2001", "funke.adeyemi@family.test", "Banker");
  const segun = block("Segun", "Adeyemi", "+234 805 000 2002", "segun.adeyemi@invalid.local");
  const bello = block("Musa", "Bello", "+234 806 000 3001", null, "Trader");
  const ngozi = block("Ngozi", "Eze", "+234 807 000 4001", "ngozi.eze@family.test");
  const effiong = block("Effiong", "Bassey", "+234 808 000 5001", "effiong.bassey@family.test", "Architect");
  const imaobong = block("Imaobong", "Bassey", "+234 808 000 5002", "imaobong.bassey@family.test");
  const aisha = block("Aisha", "Sule", "+234 809 000 6001", "aisha.sule@family.test");
  const usman = block("Usman", "Sule", "+234 809 000 6002", "usman.sule@family.test");

  const students = [
    student(1, "Chidi", "Okafor", { father: obinna, mother: chiamaka }, "father"),
    student(2, "Adaeze", "Okafor", { father: obinna, mother: chiamaka }, "father"),
    student(3, "Emeka", "Okafor", { father: obinna, mother: chiamaka }, "mother"),
    student(4, "Tolu", "Adeyemi", { father: segun, mother: funke }, "mother"),
    student(5, "Kemi", "Adeyemi", { father: segun, mother: funke }, "mother"),
    student(6, "Ibrahim", "Musa", { guardian: bello }, "guardian"),
    student(7, "Grace", "Eze", { mother: ngozi }, "mother"),
    student(8, "Daniel", "Bassey", { father: effiong, mother: imaobong }, "father"),
    student(9, "Ruth", "Bassey", { father: effiong, mother: imaobong }, "father"),
    student(10, "Fatima", "Sule", { father: usman, mother: aisha }, "mother"),
    student(11, "David", "Oke", { father: block("Tunde", "Oke", "+234 802 000 7001", "tunde.oke@family.test") }, "father"),
    student(12, "Esther", "Oke", { father: block("Tunde", "Oke", "+234 802 000 7001", "tunde.oke@family.test") }, "father"),
  ];

  const nameOf = (b: Block) => composePersonName([b.first_name, b.middle_name, b.last_name]);
  const parents = [
    parent(1, "parent", nameOf(obinna), obinna.email, obinna.phone, {
      occupation: obinna.occupation,
      present_address: address("12 Admiralty Way", "Lekki"),
      wedding_anniversary: "2008-04-19",
    }),
    parent(2, "parent", nameOf(chiamaka), chiamaka.email, chiamaka.phone, { occupation: chiamaka.occupation }),
    parent(3, "parent", nameOf(funke), funke.email, funke.phone, { occupation: funke.occupation, present_address: address("4 Allen Avenue", "Ikeja") }),
    parent(4, "parent", nameOf(segun), segun.email, segun.phone),
    parent(5, "guardian", nameOf(bello), null, bello.phone, { occupation: bello.occupation }),
    parent(6, "parent", nameOf(ngozi), ngozi.email, ngozi.phone),
    parent(7, "guardian", "Comfort Eze", "comfort.eze@family.test", "+234 807 000 4002", { created_from: "manual", occupation: "Retired teacher" }),
    parent(8, "parent", nameOf(effiong), effiong.email, effiong.phone, { occupation: effiong.occupation }),
    parent(9, "parent", nameOf(imaobong), imaobong.email, imaobong.phone),
    parent(10, "parent", nameOf(aisha), aisha.email, aisha.phone),
    parent(11, "parent", nameOf(usman), usman.email, usman.phone, { status: "inactive" }),
  ];
  const pid = (n: number) => parents[n - 1].id;
  const sid = (n: number) => students[n - 1].id;
  const link = (p: number, s: number, isPrimary = false): MockLink => ({ parent_id: pid(p), student_id: sid(s), is_primary: isPrimary, created_at: SEED_AT });
  const links = [
    link(1, 1, true), link(2, 1),
    link(1, 2, true), link(2, 2),
    link(1, 3), link(2, 3, true),
    link(3, 4, true), link(4, 4),
    link(3, 5, true), link(4, 5),
    link(5, 6, true),
    link(6, 7, true), link(7, 7),
    link(8, 8, true), link(9, 8),
    link(8, 9, true), link(9, 9),
    link(10, 10, true), link(11, 10),
    // Students 11 + 12 (the Okes): registered before Migration 040 — no parent rows yet.
  ];
  return { students, parents, links };
}

function load(): Db {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Db | null;
    if (parsed && Array.isArray(parsed.parents) && Array.isArray(parsed.links) && Array.isArray(parsed.students)) return parsed;
  } catch {
    // fall through to the seed
  }
  return seed();
}

function save(db: Db): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

function ok(data: unknown, status = 200): WireResponse {
  return { status, body: { success: true, data } };
}

function fail(status: number, code: string, message: string): WireResponse {
  return { status, body: { success: false, error: { code, message } } };
}

const live = (db: Db) => db.parents.filter((p) => !p.deleted_at);
const totalKids = (db: Db, id: string) => db.links.filter((l) => l.parent_id === id).length;

function listItem(db: Db, p: MockParent) {
  return {
    id: p.id,
    full_name: p.full_name,
    relationship: p.relationship,
    total_kids: totalKids(db, p.id),
    email: p.email,
    phone: p.phone,
    status: p.status,
    email_active: p.email_active,
  };
}

function record(db: Db, p: MockParent) {
  const rest: Partial<MockParent> = { ...p };
  delete rest.deleted_at;
  return {
    ...rest,
    total_kids: totalKids(db, p.id),
    student_ids: db.links
      .filter((l) => l.parent_id === p.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.student_id.localeCompare(b.student_id))
      .map((l) => l.student_id),
  };
}

type Body = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addressOf(value: unknown): ParentAddress {
  const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(PARENT_ADDRESS_KEYS.map((key) => [key, text(r[key])])) as ParentAddress;
}

function validate(body: Body, mode: "create" | "update"): WireResponse | null {
  if (mode === "create" || body.relationship !== undefined) {
    if (body.relationship !== "parent" && body.relationship !== "guardian") {
      return fail(422, "VALIDATION_ERROR", "relationship must be one of parent, guardian");
    }
  }
  if ((mode === "create" || body.full_name !== undefined) && !text(body.full_name)) {
    return fail(422, "VALIDATION_ERROR", "full_name is required");
  }
  if (body.username !== undefined && body.username !== null && /\s/.test(String(body.username).trim())) {
    return fail(422, "VALIDATION_ERROR", "username cannot contain spaces");
  }
  for (const key of ["date_of_birth", "wedding_anniversary"] as const) {
    const value = text(body[key]);
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(422, "VALIDATION_ERROR", `${key} must be YYYY-MM-DD`);
  }
  return null;
}

function replaceChildren(db: Db, parentId: string, studentIds: string[], now: string): WireResponse | null {
  const unique = Array.from(new Set(studentIds));
  if (unique.some((id) => !db.students.some((s) => s.id === id))) return fail(404, "STUDENT_NOT_FOUND", "Student not found");
  db.links = db.links.filter((l) => l.parent_id !== parentId || unique.includes(l.student_id));
  for (const studentId of unique) {
    if (!db.links.some((l) => l.parent_id === parentId && l.student_id === studentId)) {
      db.links.push({ parent_id: parentId, student_id: studentId, is_primary: false, created_at: now });
    }
  }
  return null;
}

function studentWire(s: MockStudent) {
  return { ...s, sibling_student_ids: [] };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function parentsDevMockTransport(method: HttpMethod, path: string, payload?: unknown): Promise<WireResponse> {
  await mockDelay(150);
  const [pathname, queryString = ""] = path.split("?");
  const query = new URLSearchParams(queryString);
  const segments = pathname.split("/").filter(Boolean); // ["erp", "parents", id?]
  const db = load();
  const now = new Date().toISOString();
  const body = (payload && typeof payload === "object" ? payload : {}) as Body;

  // ---- Student lookups the Parent page uses --------------------------------
  if (segments[1] === "students") {
    if (method !== "GET") return fail(405, "METHOD_NOT_ALLOWED", "Not supported by the dev mock");
    if (segments[2]) {
      const found = db.students.find((s) => s.id === segments[2]);
      return found ? ok(studentWire(found)) : fail(404, "STUDENT_NOT_FOUND", "Student not found");
    }
    const term = (query.get("search") ?? "").trim().toLowerCase();
    const items = db.students.filter((s) =>
      !term || `${s.first_name} ${s.other_names ?? ""} ${s.last_name} ${s.student_id}`.toLowerCase().includes(term),
    );
    const limit = Number(query.get("limit") ?? 50);
    return ok({ items: items.slice(0, limit).map(studentWire), total: items.length, page: 1, limit, has_more: items.length > limit });
  }

  if (segments[1] !== "parents") return fail(404, "NOT_FOUND", "Route not found");
  const id = segments[2];

  if (!id && method === "GET") {
    const page = Math.max(1, Number(query.get("page") ?? 1));
    const limit = Math.min(200, Math.max(1, Number(query.get("limit") ?? 50)));
    const term = (query.get("search") ?? "").trim().toLowerCase();
    const relationship = query.get("relationship");
    const status = query.get("status");
    const filtered = live(db)
      .filter((p) => !relationship || p.relationship === relationship)
      .filter((p) => !status || p.status === status)
      .filter((p) => !term || [p.full_name, p.email ?? "", p.phone ?? "", p.username].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => a.full_name.localeCompare(b.full_name) || a.id.localeCompare(b.id));
    const offset = (page - 1) * limit;
    const rows = filtered.slice(offset, offset + limit);
    return ok({ items: rows.map((p) => listItem(db, p)), total: filtered.length, page, limit, has_more: offset + rows.length < filtered.length });
  }

  if (!id && method === "POST") {
    const invalid = validate(body, "create");
    if (invalid) return invalid;
    const email = text(body.email)?.toLowerCase() ?? null;
    if (email && live(db).some((p) => p.email?.toLowerCase() === email)) return fail(409, "EMAIL_TAKEN", "A parent with this email already exists");
    const newId = crypto.randomUUID();
    const explicit = text(body.username);
    if (explicit && live(db).some((p) => p.username.toLowerCase() === explicit.toLowerCase())) return fail(409, "USERNAME_TAKEN", "Username is already in use");
    let username = explicit ?? email ?? generatedUsername(newId);
    if (!explicit && live(db).some((p) => p.username.toLowerCase() === username.toLowerCase())) username = generatedUsername(newId);
    const created: MockParent = {
      id: newId,
      relationship: body.relationship as MockParent["relationship"],
      full_name: text(body.full_name) ?? "",
      phone: text(body.phone),
      occupation: text(body.occupation),
      date_of_birth: text(body.date_of_birth),
      wedding_anniversary: text(body.wedding_anniversary),
      present_address: addressOf(body.present_address),
      other_address: addressOf(body.other_address),
      status: body.status === "inactive" ? "inactive" : "active",
      created_from: "manual",
      email,
      username,
      email_active: looksDeliverableEmail(email),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    db.parents.push(created);
    if (Array.isArray(body.student_ids)) {
      const missing = replaceChildren(db, newId, body.student_ids as string[], now);
      if (missing) return missing;
    }
    save(db);
    return ok(record(db, created), 201);
  }

  const target = id ? db.parents.find((p) => p.id === id && !p.deleted_at) : undefined;
  if (!target) return fail(404, "PARENT_NOT_FOUND", "Parent not found");

  if (method === "GET") return ok(record(db, target));

  if (method === "PUT") {
    const invalid = validate(body, "update");
    if (invalid) return invalid;
    const email = body.email === undefined ? target.email : (text(body.email)?.toLowerCase() ?? null);
    if (email && email !== target.email && live(db).some((p) => p.id !== target.id && p.email?.toLowerCase() === email)) {
      return fail(409, "EMAIL_TAKEN", "A parent with this email already exists");
    }
    const username = body.username === undefined ? target.username : text(body.username);
    if (!username) return fail(422, "VALIDATION_ERROR", "username is required");
    if (live(db).some((p) => p.id !== target.id && p.username.toLowerCase() === username.toLowerCase())) {
      return fail(409, "USERNAME_TAKEN", "Username is already in use");
    }
    if (Array.isArray(body.student_ids)) {
      const missing = replaceChildren(db, target.id, body.student_ids as string[], now);
      if (missing) return missing;
    }
    const pick = <K extends keyof MockParent>(key: K, value: MockParent[K]): MockParent[K] => (body[key] === undefined ? target[key] : value);
    Object.assign(target, {
      relationship: pick("relationship", body.relationship as MockParent["relationship"]),
      full_name: pick("full_name", text(body.full_name) ?? target.full_name),
      phone: pick("phone", text(body.phone)),
      occupation: pick("occupation", text(body.occupation)),
      date_of_birth: pick("date_of_birth", text(body.date_of_birth)),
      wedding_anniversary: pick("wedding_anniversary", text(body.wedding_anniversary)),
      present_address: pick("present_address", addressOf(body.present_address)),
      other_address: pick("other_address", addressOf(body.other_address)),
      status: pick("status", body.status === "inactive" ? "inactive" : "active"),
      email,
      username,
      email_active: looksDeliverableEmail(email),
      updated_at: now,
    });
    save(db);
    return ok(record(db, target));
  }

  if (method === "DELETE") {
    target.deleted_at = now;
    target.updated_at = now;
    save(db);
    return ok({ deleted: true });
  }

  return fail(405, "METHOD_NOT_ALLOWED", "Not supported by the dev mock");
}

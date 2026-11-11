import type { CrudResult } from "@/lib/setup/crudTypes";
import { examSend } from "@/lib/exam/examApi";
import type { ProgressionActor, ProgressionPoint } from "@/lib/exam/reportProgression/reportProgressionApi";

/**
 * REPORT PROGRESSION — Stage 4: Send Result to Parent (opened from a
 * class's "Send Result to Parent"). Same transport as the rest of Exam
 * (examApi's USE_MOCK flag; the dev-bypass guard applies).
 *
 * The list is the class's students for the term + point, cut to the
 * caller's standard effective_scope — the SAME rows as the class view —
 * each with its parent contact. Only a PUBLISHED report on a row the
 * caller manages (can_manage) can be sent; the rest are listed but not
 * selectable. Access = the exam.report_progression.send group credential.
 *
 * CHANNELS. Each channel's dispatch state comes from the backend, so the
 * Parent-module swap needs no screen change:
 *   "live"        — it really goes out (email: queued for delivery).
 *   "recorded"    — the send is accepted and RECORDED (who / when / which
 *                   reports / to which address) but nothing is delivered
 *                   yet. EMAIL is "recorded" until the Parent module's
 *                   email dispatch lands; the backend then flips it to
 *                   "live" and the same POST starts delivering.
 *                   SMS is "recorded" too: the school's SMS config
 *                   exists (Settings › API Integrations), the dispatch
 *                   doesn't yet.
 *   "unavailable" — framework only: selectable in the UI, marked "coming
 *                   soon", a no-op on send. WHATSAPP is "unavailable" this
 *                   delivery (per-school WhatsApp API not built yet).
 *
 * WHAT EACH CHANNEL CARRIES. Email and WhatsApp send the report PDF FILE.
 * SMS can't carry a file, so it sends a short TEXT with the report's PDF
 * URL (the backend's hosted report link, DEC-008) — the backend composes
 * the text; the frontend only states it.
 *
 * PARENT CONTACT. One contact per student — the backend picks the primary
 * one from the student's parent / guardian blocks (Students wizard step 3:
 * father / mother / guardian, each with phone + email). `phone` is that
 * parent phone and serves BOTH WhatsApp and SMS — no separate SMS or
 * WhatsApp number is modelled (FLAGGED: a separate WhatsApp number /
 * opt-in is for the WhatsApp spec). Mocked until the Parent module ships.
 *
 * PROPOSED REST contract (names are proposals — reconcile with Muntajir):
 *
 *   GET /api/v1/erp/report-progression/classes/:class_id/send?term_id=&point=ca|exam
 *     -> { class_id, class_name, term_id, term_name, point,
 *          channels: { email: Dispatch, whatsapp: Dispatch, sms: Dispatch },
 *          items: [SendRecipient] }   (school order, as the class view)
 *     403 OUT_OF_SCOPE (no student of the class in scope).
 *
 *   POST /api/v1/erp/report-progression/send
 *     body { term_id, point, student_ids[], channels: ("email"|"whatsapp"|"sms")[] }
 *     -> { channels, items: [{ student_id, email, whatsapp, sms }] }
 *     Per student and requested channel, the outcome:
 *       email:    "queued" (live) | "recorded" | "no_email"
 *       whatsapp: "queued" (live) | "recorded" | "unavailable" | "no_number"
 *       sms:      "queued" (live) | "recorded" | "unavailable" | "no_number"
 *       (null = channel not requested)
 *     Missing contacts are SKIPPED per channel, not errors. The send log
 *     (last_sent) is written for a student whenever any channel's outcome
 *     is "queued" or "recorded"; it holds that send's per-channel result
 *     (address / number used).
 *     422 VALIDATION_ERROR (no students / no channel / unknown point),
 *     422 NOT_PUBLISHED (a report isn't published for the term + point),
 *     403 FORBIDDEN (missing exam.report_progression.send, or a
 *     subject-only row), 403 OUT_OF_SCOPE.
 */

export const SEND_CHANNELS = ["email", "whatsapp", "sms"] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];

export type ChannelDispatch = "live" | "recorded" | "unavailable";

export type ParentRelationship = "father" | "mother" | "guardian";

export type ParentContact = {
  name: string | null;
  relationship: ParentRelationship | null;
  email: string | null;
  /** Parent phone (E.164-ish display string) — used for WhatsApp AND SMS; null = no number on file. */
  phone: string | null;
};

export type EmailOutcome = "queued" | "recorded" | "no_email";
export type PhoneOutcome = "queued" | "recorded" | "unavailable" | "no_number";

/** A channel that went out (or was recorded) on a send. */
export type SentVia = { to: string; outcome: "queued" | "recorded" };

export type SendLogEntry = {
  at: string;
  by: ProgressionActor | null;
  /** Per channel: where it went (or was recorded as going); absent = not sent on that channel. */
  via: Partial<Record<SendChannel, SentVia>>;
};

export type SendRecipient = {
  student_id: string;
  student_name: string;
  admission_no: string;
  photo_url: string | null;
  class_arm_id: string;
  arm_name: string;
  /** null = not published for this term + point (can't be sent). */
  published: { at: string } | null;
  /** false = subject-scoped row (view-only, never sendable). */
  can_manage: boolean;
  contact: ParentContact;
  /** The last send for this term + point; null = never sent. */
  last_sent: SendLogEntry | null;
};

export type SendRecipients = {
  class_id: string;
  class_name: string;
  term_id: string;
  term_name: string;
  point: ProgressionPoint;
  channels: Record<SendChannel, ChannelDispatch>;
  items: SendRecipient[];
};

export type SendInput = { term_id: string; point: ProgressionPoint; student_ids: string[]; channels: SendChannel[] };

export type SendOutcome = { student_id: string; email: EmailOutcome | null; whatsapp: PhoneOutcome | null; sms: PhoneOutcome | null };

export type SendResult = { channels: Record<SendChannel, ChannelDispatch>; items: SendOutcome[] };

export const sendToParentQueryKeys = {
  // Under reportProgressionQueryKeys.all, so publish / unpublish refresh it too.
  recipients: (classId: string, termId: string, point: ProgressionPoint) => ["exam", "report-progression", "send", classId, termId, point] as const,
};

export function isSendChannel(value: unknown): value is SendChannel {
  return (SEND_CHANNELS as readonly unknown[]).includes(value);
}

/** Why a row can't be ticked; null = sendable. */
export function blockedReason(row: SendRecipient): "subjectOnly" | "unpublished" | null {
  if (!row.can_manage) return "subjectOnly";
  if (!row.published) return "unpublished";
  return null;
}

/** Whether this row can actually be reached on a channel (WhatsApp and SMS share the parent phone). */
export function reachable(row: SendRecipient, channel: SendChannel): boolean {
  return channel === "email" ? !!row.contact.email : !!row.contact.phone;
}

/** Email and WhatsApp carry the PDF file; SMS carries a link to it. */
export function channelCarries(channel: SendChannel): "file" | "link" {
  return channel === "sms" ? "link" : "file";
}

/** A channel that does something on send ("live" or "recorded"). */
export function isSendable(dispatch: ChannelDispatch): boolean {
  return dispatch !== "unavailable";
}

// ---------------------------------------------------------------------------
// Wire readers (structural only)
// ---------------------------------------------------------------------------

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recipientsFromWire(value: unknown): SendRecipients | null {
  const r = rec(value);
  return Array.isArray(r.items) && typeof r.class_id === "string" && r.channels ? (r as unknown as SendRecipients) : null;
}

function resultFromWire(value: unknown): SendResult | null {
  const r = rec(value);
  return Array.isArray(r.items) && r.channels ? (r as unknown as SendResult) : null;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export function getSendRecipients(classId: string, termId: string, point: ProgressionPoint): Promise<CrudResult<SendRecipients>> {
  const query = new URLSearchParams({ point });
  if (termId) query.set("term_id", termId);
  return examSend("GET", `erp/report-progression/classes/${encodeURIComponent(classId)}/send?${query}`, undefined, recipientsFromWire);
}

export function sendResultsToParents(input: SendInput): Promise<CrudResult<SendResult>> {
  return examSend("POST", "erp/report-progression/send", input, resultFromWire);
}

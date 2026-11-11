import { seedHash } from "@/lib/exam/mock/examMockSeeds";
import type { ParentContact, ParentRelationship } from "@/lib/exam/reportProgression/sendToParentApi";

/**
 * MOCK parent contacts for Send Result to Parent (Stage 4), until the
 * Parent module ships and the backend returns the student's primary
 * parent / guardian contact itself. Deterministic per student so the
 * screen is stable across reloads. Every address is @example.com and
 * every number is in the reserved +234 800 000 range — nothing here can
 * reach a real person.
 *
 * Gaps are seeded on purpose so the "can't be emailed" / "no phone (no
 * WhatsApp / SMS)" states show: about 1 in 6 has no email, about 1 in 5
 * no number.
 */

const RELATIONSHIPS: ParentRelationship[] = ["father", "mother", "guardian"];
const TITLES: Record<ParentRelationship, string> = { father: "Mr", mother: "Mrs", guardian: "Mr/Mrs" };

export function seedParentContact(studentId: string, studentName: string): ParentContact {
  const hash = seedHash(`parent:${studentId}`);
  const surname = studentName.split(" ").pop() ?? studentName;
  const relationship = RELATIONSHIPS[hash % RELATIONSHIPS.length];
  const hasEmail = (hash >>> 5) % 6 !== 0;
  const hasNumber = (hash >>> 9) % 5 !== 0;
  const tail = String((hash >>> 3) % 10000).padStart(4, "0");
  return {
    name: `${TITLES[relationship]} ${surname}`,
    relationship,
    email: hasEmail ? `${surname.toLowerCase().replace(/[^a-z]/g, "")}.${tail}@example.com` : null,
    phone: hasNumber ? `+234 800 000 ${tail}` : null,
  };
}

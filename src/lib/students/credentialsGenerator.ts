/**
 * Username: `${student_id_prefix}${admission_number}` when both exist;
 * falls back to an improvised sequence when there's no admission number,
 * or to a hardcoded "STU" prefix when Settings has no student_id_prefix
 * configured at all. student_id_prefix itself is read from the REAL
 * Settings API (SettingsData.general_behaviour.student_id_prefix — already
 * confirmed to exist, no mock needed) by the caller (LoginDetailsSection),
 * not here.
 *
 * The sequence below is explicitly MOCK-ONLY — a real API needs a
 * server-assigned atomic counter per school to avoid collisions; this is
 * just enough to make the mock wizard demoable end to end.
 */
let mockSequenceCounter = 0;

function nextMockSequence(): string {
  mockSequenceCounter += 1;
  return String(mockSequenceCounter).padStart(4, "0");
}

export function generateUsername(studentIdPrefix: string | null, admissionNumber: string): string {
  const prefix = studentIdPrefix?.trim() || "STU";
  const trimmedAdmission = admissionNumber.trim();
  return trimmedAdmission ? `${prefix}${trimmedAdmission}` : `${prefix}${nextMockSequence()}`;
}

const PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const PASSWORD_LOWER = "abcdefghijkmnpqrstuvwxyz";
const PASSWORD_DIGITS = "23456789";
const PASSWORD_SYMBOLS = "!@#$%";

function randomChar(pool: string): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 10 chars: 2 upper, 2 digits, 1 symbol, rest lower, shuffled — readable-ish, meets typical complexity rules. */
export function generatePassword(): string {
  const required = [
    randomChar(PASSWORD_UPPER),
    randomChar(PASSWORD_UPPER),
    randomChar(PASSWORD_DIGITS),
    randomChar(PASSWORD_DIGITS),
    randomChar(PASSWORD_SYMBOLS),
  ];
  const rest = Array.from({ length: 5 }, () => randomChar(PASSWORD_LOWER));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

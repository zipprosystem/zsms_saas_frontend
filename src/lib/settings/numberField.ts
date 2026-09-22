// Shared by every panel with a numeric field (General Behaviour's
// records_per_page/absence_end_delay_days, Question Bank's
// questions_per_page/default_exam_duration_minutes). Numbers are edited as
// plain text (not <input type="number">, for consistent cross-browser
// behavior and full control over validation) and parsed back on save.

/** Seeds a numeric form field from the contract's real number value. */
export function toNumberFieldState(value: number): string {
  return String(value);
}

/** Non-negative integers only — `null` for anything else (blank, decimal, negative, non-numeric). */
export function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

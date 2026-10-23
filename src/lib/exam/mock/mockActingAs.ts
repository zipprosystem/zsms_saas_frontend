import { SEED_TEACHERS } from "@/lib/exam/mock/examMockSeeds";

/**
 * MOCK-ONLY "who am I" for the Exam mock. The real backend reads the
 * caller from the access token and applies their effective_scope; the
 * mock can't, so a dev-only picker on the marks screen sets this instead.
 * Never sent to a real endpoint.
 */
export const MOCK_ADMIN = "admin";

const STORAGE_KEY = "zsms.mockExam.actingAs";

export type MockActor = { id: string; name: string | null };

export function mockActors(): MockActor[] {
  return [{ id: MOCK_ADMIN, name: null }, ...SEED_TEACHERS.map((teacher) => ({ id: teacher.id, name: teacher.name }))];
}

export function getMockActingAs(): string {
  if (typeof window === "undefined") return MOCK_ADMIN;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && (value === MOCK_ADMIN || SEED_TEACHERS.some((teacher) => teacher.id === value)) ? value : MOCK_ADMIN;
  } catch {
    return MOCK_ADMIN;
  }
}

export function setMockActingAs(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Storage disabled — the choice just won't persist.
  }
}

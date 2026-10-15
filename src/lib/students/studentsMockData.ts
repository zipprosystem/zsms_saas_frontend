import type { Agent, StudentMode } from "@/lib/students/studentTypes";

/**
 * MOCK — "school_mode" (day|boarding|both) is a real Settings field we've
 * flagged to Muntajir but isn't built yet (it only ever existed inside the
 * onboarding payload, never persisted anywhere readable post-signup — not
 * in Settings, not on useAuth()'s `school` object). The Add Student
 * wizard's Step 1 Mode field needs SOME default, so this hardcodes "day"
 * until Settings grows a real field. If school_mode is "both", the wizard
 * should default to NO selection (force the user to pick) — not modeled
 * here since there's no real "both" to detect yet; revisit once this is
 * un-mocked.
 */
export const MOCK_SCHOOL_MODE: StudentMode = "day";

/**
 * Illustrative-only reference data for the parts of the Students UI whose
 * backing entities don't exist backend-side yet: Academic Houses, Boarding
 * Houses, Extra-curricular activities, Agents. Students themselves are
 * REAL now (studentsApi.ts) and none of these ids are ever sent to it —
 * they're UI-only fields (see studentTypes.ts). Ids are prefixed "mock-"
 * so they can never be confused with real ones.
 */
export type MockRef = { id: string; name: string };

export const MOCK_HOUSES: MockRef[] = [
  { id: "mock-house-red", name: "Red House" },
  { id: "mock-house-blue", name: "Blue House" },
  { id: "mock-house-green", name: "Green House" },
  { id: "mock-house-yellow", name: "Yellow House" },
];

/** Dormitory/hostel a BOARDING student lives in — distinct from the academic (inter-house competition) houses above. Only assigned to mode:"boarding" students. */
export const MOCK_BOARDING_HOUSES: MockRef[] = [
  { id: "mock-boarding-unity", name: "Unity Hall" },
  { id: "mock-boarding-peace", name: "Peace Hall" },
  { id: "mock-boarding-harmony", name: "Harmony Hall" },
];

export const MOCK_EXTRA_CURRICULAR: MockRef[] = [
  { id: "mock-activity-football", name: "Football" },
  { id: "mock-activity-choir", name: "Choir" },
  { id: "mock-activity-debate", name: "Debate" },
];

export const MOCK_AGENTS: Agent[] = [
  { id: "mock-agent-1", name: "Chidi Okafor", agency: "Bright Futures Agency" },
  { id: "mock-agent-2", name: "Amina Bello", agency: "EduLink Partners" },
  { id: "mock-agent-3", name: "Grace Adeyemi", agency: null },
];

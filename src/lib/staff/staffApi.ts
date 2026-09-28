/**
 * MOCK pending Staff/HR module — the Staff module doesn't exist yet, so
 * this stands in as a small, isolated read-only reference-data source for
 * dropdowns that need to point at a staff member (currently: Departments'
 * HOD / senior line manager). No CRUD here on purpose — this file goes
 * away and gets replaced by a real staffApi.ts once the Staff/HR module
 * ships; nothing outside this file should need to change when that
 * happens, since consumers only ever see `StaffMember` + `listStaff()`.
 */
export type StaffMember = {
  id: string;
  full_name: string;
  role: string;
};

const MOCK_STAFF: StaffMember[] = [
  { id: "staff-1", full_name: "Adaeze Okafor", role: "Principal" },
  { id: "staff-2", full_name: "Emeka Nwosu", role: "Vice Principal (Academics)" },
  { id: "staff-3", full_name: "Funmilayo Adebayo", role: "Senior Teacher, Sciences" },
  { id: "staff-4", full_name: "Ibrahim Suleiman", role: "Senior Teacher, Languages" },
  { id: "staff-5", full_name: "Chiamaka Eze", role: "Teacher, Humanities" },
  { id: "staff-6", full_name: "Tunde Bakare", role: "Teacher, Mathematics" },
];

/** Shared by every consumer's useQuery call so they hit the same cache entry. */
export const staffQueryKey = ["staff", "all"] as const;

function resolveAfter<T>(value: T, ms = 150): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export async function listStaff(): Promise<StaffMember[]> {
  return resolveAfter(MOCK_STAFF);
}

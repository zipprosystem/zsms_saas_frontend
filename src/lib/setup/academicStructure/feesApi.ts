import { mockDelay } from "@/lib/onboarding/mockDelay";

/**
 * MOCK — there is no Fees/Accounts API yet. Classes' optional `fee_id`
 * field is UUID-only per Muntajir, so these mock ids are plausible UUIDs
 * rather than short slugs, to behave the same as the real thing once it
 * exists. Swap this file for a real service (list() is the only method
 * Classes needs — this isn't a CRUD screen, just a reference dropdown)
 * once the Fees module ships; nothing else in classesApi.ts/ClassesScreen
 * needs to change, they only ever call `feesService.list()`.
 */
export type Fee = {
  id: string;
  name: string;
};

const MOCK_FEES: Fee[] = [
  { id: "a1b2c3d4-0001-4000-8000-000000000001", name: "Tuition Fee" },
  { id: "a1b2c3d4-0001-4000-8000-000000000002", name: "Development Levy" },
  { id: "a1b2c3d4-0001-4000-8000-000000000003", name: "Boarding Fee" },
  { id: "a1b2c3d4-0001-4000-8000-000000000004", name: "PTA Fee" },
];

async function list(): Promise<Fee[]> {
  await mockDelay(300);
  return [...MOCK_FEES];
}

export const feesService = { list };

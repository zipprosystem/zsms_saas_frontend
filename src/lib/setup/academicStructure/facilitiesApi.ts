import { mockDelay } from "@/lib/onboarding/mockDelay";

/**
 * MOCK — there is no Physical Space API yet. Class-arms/Sections' optional
 * building_id/classroom_id fields are UUID-only per Muntajir, so these
 * mock ids are plausible UUIDs rather than short slugs, to behave the same
 * as the real thing once it exists. Only list() is needed — these are
 * reference dropdowns for the Class-arms form, not their own CRUD screens
 * here. Swap this file for a real service once Physical Space ships;
 * nothing in sectionsApi.ts/ClassArmsScreen needs to change beyond the
 * import, they only ever call `buildingsService.list()`/`classroomsService.list()`.
 */
export type Building = {
  id: string;
  name: string;
};

export type Classroom = {
  id: string;
  name: string;
};

const MOCK_BUILDINGS: Building[] = [
  { id: "b2c3d4e5-0010-4000-8000-000000000001", name: "Main Block" },
  { id: "b2c3d4e5-0010-4000-8000-000000000002", name: "Annex Block" },
  { id: "b2c3d4e5-0010-4000-8000-000000000003", name: "Science Block" },
];

const MOCK_CLASSROOMS: Classroom[] = [
  { id: "c2d3e4f5-0011-4000-8000-000000000001", name: "Room 101" },
  { id: "c2d3e4f5-0011-4000-8000-000000000002", name: "Room 102" },
  { id: "c2d3e4f5-0011-4000-8000-000000000003", name: "Room 201" },
];

async function listBuildings(): Promise<Building[]> {
  await mockDelay(300);
  return [...MOCK_BUILDINGS];
}

async function listClassrooms(): Promise<Classroom[]> {
  await mockDelay(300);
  return [...MOCK_CLASSROOMS];
}

export const buildingsService = { list: listBuildings };
export const classroomsService = { list: listClassrooms };

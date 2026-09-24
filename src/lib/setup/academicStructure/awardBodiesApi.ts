import { mockDelay } from "@/lib/onboarding/mockDelay";
import type { CrudResult, CrudService } from "@/lib/setup/crudTypes";

/**
 * MOCK — swap for real GET/POST/PUT/DELETE /api/v1/erp/award-bodies (or
 * whatever Muntajir provides) once he sends the contract; he's said it's
 * coming shortly but hasn't yet, unlike Academic Years/School Types which
 * are already confirmed and real. Same CrudService signature as those, so
 * swapping this file for a real implementation is the only change needed
 * — School Types' award-body dropdown (schoolTypesApi consumer side)
 * doesn't need to know or care that this is a mock.
 *
 * Fields are a reasonable guess (name, description) pending that contract
 * — no is_active, per the confirmed Figma/backend-owner correction for
 * this entity.
 *
 * Seeded from onboarding's existing AWARD_BODIES list/labels
 * (src/lib/onboarding/config.ts) so the names match what a school already
 * saw during signup, rather than inventing new ones. Descriptions are
 * original placeholder copy, not confirmed real content.
 */
export type AwardBody = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type AwardBodyInput = {
  name: string;
  description: string | null;
};

let mockAwardBodies: AwardBody[] = [
  {
    id: "waec",
    name: "WAEC",
    description: "West African Examinations Council — regional senior secondary examining body.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "neco",
    name: "NECO",
    description: "National Examinations Council — Nigerian senior secondary examining body.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "cambridge",
    name: "Cambridge",
    description: "Cambridge Assessment International Education — IGCSE and A Level.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "ib",
    name: "IB",
    description: "International Baccalaureate — globally recognised diploma programme.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "edexcel",
    name: "Edexcel",
    description: "Pearson Edexcel — UK-based international qualifications.",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

function generateId(): string {
  return `award-body-${Math.random().toString(36).slice(2, 10)}`;
}

async function list(): Promise<CrudResult<AwardBody[]>> {
  await mockDelay(300);
  return { ok: true, data: [...mockAwardBodies] };
}

async function create(data: AwardBodyInput): Promise<CrudResult<AwardBody>> {
  await mockDelay(400);
  const now = new Date().toISOString();
  const created: AwardBody = {
    id: generateId(),
    name: data.name,
    description: data.description,
    created_at: now,
    updated_at: now,
  };
  mockAwardBodies = [...mockAwardBodies, created];
  return { ok: true, data: created };
}

async function update(id: string, data: AwardBodyInput): Promise<CrudResult<AwardBody>> {
  await mockDelay(400);
  const existing = mockAwardBodies.find((body) => body.id === id);
  if (!existing) return { ok: false, kind: "server" };

  const updated: AwardBody = {
    ...existing,
    name: data.name,
    description: data.description,
    updated_at: new Date().toISOString(),
  };
  mockAwardBodies = mockAwardBodies.map((body) => (body.id === id ? updated : body));
  return { ok: true, data: updated };
}

async function remove(id: string): Promise<CrudResult<void>> {
  await mockDelay(300);
  mockAwardBodies = mockAwardBodies.filter((body) => body.id !== id);
  return { ok: true, data: undefined };
}

export const awardBodiesService: CrudService<AwardBody, AwardBodyInput, AwardBodyInput> = {
  list,
  create,
  update,
  remove,
};

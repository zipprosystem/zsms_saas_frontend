import type { AssessmentStructure } from "@/lib/setup/assessmentConfiguration/assessmentStructure";

/**
 * Demo structures for the mock — one of each breakdown style, all totalling
 * 100. Fixed ids so a re-seed is stable across reloads.
 */
export const SEED_ASSESSMENT_STRUCTURES: AssessmentStructure[] = [
  {
    id: "as-seed-standard",
    name: "Standard (CA 40 / Exam 60)",
    mode: "component_based",
    is_default: true,
    is_active: true,
    is_grade_book: false,
    components: [
      { id: "as-seed-standard-ca1", name: "CA 1", category: "ca", max: 20, weight: null, display_order: 1, breakdown: "none", subfields: [] },
      { id: "as-seed-standard-ca2", name: "CA 2", category: "ca", max: 20, weight: null, display_order: 2, breakdown: "none", subfields: [] },
      { id: "as-seed-standard-exam", name: "Exam", category: "exam", max: 60, weight: null, display_order: 3, breakdown: "none", subfields: [] },
    ],
  },
  {
    id: "as-seed-composite",
    name: "Composite CA (30 / 70)",
    mode: "component_based",
    is_default: false,
    is_active: true,
    is_grade_book: false,
    components: [
      {
        id: "as-seed-composite-ca",
        name: "Continuous Assessment",
        category: "ca",
        max: 30,
        weight: null,
        display_order: 1,
        breakdown: "sum",
        subfields: [
          { id: "as-seed-composite-t1", name: "Test 1", max: 10, weight: null, display_order: 1 },
          { id: "as-seed-composite-t2", name: "Test 2", max: 10, weight: null, display_order: 2 },
          { id: "as-seed-composite-as", name: "Assignment", max: 10, weight: null, display_order: 3 },
        ],
      },
      { id: "as-seed-composite-exam", name: "Exam", category: "exam", max: 70, weight: null, display_order: 2, breakdown: "none", subfields: [] },
    ],
  },
  {
    id: "as-seed-weighted",
    name: "Weighted coursework",
    mode: "component_based",
    is_default: false,
    is_active: false,
    is_grade_book: false,
    components: [
      {
        id: "as-seed-weighted-cw",
        name: "Coursework",
        category: "ca",
        max: 40,
        weight: null,
        display_order: 1,
        breakdown: "weighted",
        subfields: [
          { id: "as-seed-weighted-pr", name: "Project", max: 50, weight: 60, display_order: 1 },
          { id: "as-seed-weighted-pt", name: "Presentation", max: 20, weight: 40, display_order: 2 },
        ],
      },
      // Scored out of 100, scaled to 60 of the overall 100.
      { id: "as-seed-weighted-exam", name: "Exam", category: "exam", max: 100, weight: 60, display_order: 2, breakdown: "none", subfields: [] },
    ],
  },
  {
    // British Grade Book (offered on the Grade Book entry page only): four fields totalling 100.
    id: "as-seed-grade-book",
    name: "Grade Book (Tests 10/10 · H&C 10 · UA 70)",
    mode: "component_based",
    is_default: false,
    is_active: true,
    is_grade_book: true,
    components: [
      { id: "as-seed-gb-t1", name: "Test 1", category: "ca", max: 10, weight: null, display_order: 1, breakdown: "none", subfields: [] },
      { id: "as-seed-gb-t2", name: "Test 2", category: "ca", max: 10, weight: null, display_order: 2, breakdown: "none", subfields: [] },
      { id: "as-seed-gb-hc", name: "Homework & Classwork", category: "ca", max: 10, weight: null, display_order: 3, breakdown: "none", subfields: [] },
      { id: "as-seed-gb-ua", name: "Unified Assessment", category: "ca", max: 70, weight: null, display_order: 4, breakdown: "none", subfields: [] },
    ],
  },
];

import type { ComponentType } from "react";
import { AcademicYearsScreen } from "@/components/setup/academicStructure/AcademicYearsScreen";
import { AwardBodiesScreen } from "@/components/setup/academicStructure/AwardBodiesScreen";
import { SchoolTypesScreen } from "@/components/setup/academicStructure/SchoolTypesScreen";
import { ClassesScreen } from "@/components/setup/academicStructure/ClassesScreen";
import { ClassArmsScreen } from "@/components/setup/academicStructure/ClassArmsScreen";

/**
 * Keyed by "{categorySlug}/{screenSlug}". A screen not listed here falls
 * back to the generic "coming soon" placeholder in
 * /admin/setup/[category]/[screen]/page.tsx — add an entry as each of the
 * ~29 screens gets built.
 */
export const setupScreenRegistry: Record<string, ComponentType> = {
  "academic-structure/academic-years": AcademicYearsScreen,
  // Award Bodies before School Types — School Types' form depends on
  // Award Bodies existing (its dropdown is populated from that service).
  "academic-structure/award-bodies": AwardBodiesScreen,
  "academic-structure/school-types": SchoolTypesScreen,
  // Classes' form depends on School Types existing (its dropdown is
  // populated from that service) — same reasoning as School Types/Award
  // Bodies above.
  "academic-structure/classes": ClassesScreen,
  // Class-arms' school type selector + form depend on both School Types
  // and Classes existing.
  "academic-structure/class-arms": ClassArmsScreen,
};

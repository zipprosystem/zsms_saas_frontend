import type { ComponentType } from "react";
import { AcademicYearsScreen } from "@/components/setup/academicStructure/AcademicYearsScreen";
import { AwardBodiesScreen } from "@/components/setup/academicStructure/AwardBodiesScreen";
import { SchoolTypesScreen } from "@/components/setup/academicStructure/SchoolTypesScreen";
import { ClassesScreen } from "@/components/setup/academicStructure/ClassesScreen";
import { ClassArmsScreen } from "@/components/setup/academicStructure/ClassArmsScreen";
import { ClassTermsScreen } from "@/components/setup/academicStructure/ClassTermsScreen";
import { DepartmentsScreen } from "@/components/setup/academicStructure/DepartmentsScreen";
import { SubjectsMasterScreen } from "@/components/setup/academicStructure/SubjectsMasterScreen";
import { ClassSubjectsScreen } from "@/components/setup/academicStructure/ClassSubjectsScreen";
import { ClassSubjectGroupingScreen } from "@/components/setup/academicStructure/ClassSubjectGroupingScreen";
import { StudentTermDetailsScreen } from "@/components/setup/academicStructure/StudentTermDetailsScreen";

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
  // Class Terms' form depends on Classes existing (its "Apply to" checklist
  // is populated from that service).
  "academic-structure/class-terms": ClassTermsScreen,
  "academic-structure/departments": DepartmentsScreen,
  // Subject Master's Department dropdown depends on Departments existing —
  // same reasoning as every other dependency-ordered pair above.
  "academic-structure/subjects-master": SubjectsMasterScreen,
  // Class Subjects' form depends on Classes + Subject Master existing.
  "academic-structure/class-subjects": ClassSubjectsScreen,
  // Grouping's form depends on Classes + Class Subjects existing.
  "academic-structure/class-subject-grouping": ClassSubjectGroupingScreen,
  // Student Term Details' form depends on Classes + Class-arms + Class
  // Terms existing (and the mock Students module having at least one
  // active student to place).
  "academic-structure/student-term-details": StudentTermDetailsScreen,
};

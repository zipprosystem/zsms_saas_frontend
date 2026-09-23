import type { ComponentType } from "react";
import { AcademicYearsScreen } from "@/components/setup/academicStructure/AcademicYearsScreen";

/**
 * Keyed by "{categorySlug}/{screenSlug}". A screen not listed here falls
 * back to the generic "coming soon" placeholder in
 * /admin/setup/[category]/[screen]/page.tsx — add an entry as each of the
 * ~29 screens gets built.
 */
export const setupScreenRegistry: Record<string, ComponentType> = {
  "academic-structure/academic-years": AcademicYearsScreen,
};

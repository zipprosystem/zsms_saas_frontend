"use client";

import { useState } from "react";
import { setupCategories } from "@/lib/setup/setupConfig";
import { CategoryCard } from "./CategoryCard";

const DEFAULT_EXPANDED_KEYS = ["schoolSettings", "academicStructure"];

export function SetupCategoriesSection() {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED_KEYS),
  );

  const toggleCategory = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {setupCategories.map((category) => (
        <CategoryCard
          key={category.key}
          category={category}
          isExpanded={expandedKeys.has(category.key)}
          onToggle={() => toggleCategory(category.key)}
        />
      ))}
    </div>
  );
}

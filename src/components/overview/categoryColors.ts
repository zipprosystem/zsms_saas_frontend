/**
 * Tailwind JIT needs literal class names in source — colorToken strings from
 * setupConfig can't be interpolated into class names directly, so this maps
 * each token to its pre-written Tailwind classes.
 */
export const categoryColorClasses: Record<
  string,
  { bg: string; text: string; dot: string; tint: string }
> = {
  "category-purple": {
    bg: "bg-category-purple",
    text: "text-category-purple",
    dot: "bg-category-purple",
    tint: "bg-category-purple-tint",
  },
  "category-blue": {
    bg: "bg-category-blue",
    text: "text-category-blue",
    dot: "bg-category-blue",
    tint: "bg-category-blue-tint",
  },
  "category-cyan": {
    bg: "bg-category-cyan",
    text: "text-category-cyan",
    dot: "bg-category-cyan",
    tint: "bg-category-cyan-tint",
  },
  "category-green": {
    bg: "bg-category-green",
    text: "text-category-green",
    dot: "bg-category-green",
    tint: "bg-category-green-tint",
  },
  "category-amber": {
    bg: "bg-category-amber",
    text: "text-category-amber",
    dot: "bg-category-amber",
    tint: "bg-category-amber-tint",
  },
};

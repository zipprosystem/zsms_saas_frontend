/**
 * Tailwind JIT needs literal class names in source — colorToken strings from
 * setupConfig can't be interpolated into class names directly, so this maps
 * each token to its pre-written Tailwind classes.
 */
export const categoryColorClasses: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  "category-purple": {
    bg: "bg-category-purple",
    text: "text-category-purple",
    dot: "bg-category-purple",
  },
  "category-blue": {
    bg: "bg-category-blue",
    text: "text-category-blue",
    dot: "bg-category-blue",
  },
  "category-cyan": {
    bg: "bg-category-cyan",
    text: "text-category-cyan",
    dot: "bg-category-cyan",
  },
  "category-green": {
    bg: "bg-category-green",
    text: "text-category-green",
    dot: "bg-category-green",
  },
  "category-amber": {
    bg: "bg-category-amber",
    text: "text-category-amber",
    dot: "bg-category-amber",
  },
};

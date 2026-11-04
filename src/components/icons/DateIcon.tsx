import type { SVGProps } from "react";

/** Calendar glyph for date fields (currentColor only, so it follows the theme). */
export function DateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <rect x="2.917" y="3.75" width="14.167" height="13.333" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.917 8.333h14.166M6.667 2.083v3.334M13.333 2.083v3.334" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

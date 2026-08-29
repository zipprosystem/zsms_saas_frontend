import type { SVGProps } from "react";

/**
 * Decorative 5-star cluster. Purely ornamental — aria-hidden, no semantic
 * meaning. Fills with currentColor so callers set color via a text-* class.
 */
export function StarburstIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 140 90"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M32 8 36.2 20.8 49 25 36.2 29.2 32 42 27.8 29.2 15 25 27.8 20.8 32 8Z" />
      <path d="M96 4 98.6 12 106.6 14.6 98.6 17.2 96 25.2 93.4 17.2 85.4 14.6 93.4 12 96 4Z" />
      <path d="M120 30 122 36.4 128.4 38.4 122 40.4 120 46.8 118 40.4 111.6 38.4 118 36.4 120 30Z" />
      <path d="M70 45 72.4 52.6 80 55 72.4 57.4 70 65 67.6 57.4 60 55 67.6 52.6 70 45Z" />
      <path d="M108 58 109.6 63 114.6 64.6 109.6 66.2 108 71.2 106.4 66.2 101.4 64.6 106.4 63 108 58Z" />
    </svg>
  );
}

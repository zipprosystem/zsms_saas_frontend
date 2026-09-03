import type { SVGProps } from "react";

export function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M8.284 4.253A8.842 8.842 0 0 1 10 4.167c5.833 0 8.333 5.833 8.333 5.833a15.29 15.29 0 0 1-2.157 3.157m-2.474 2.006A8.647 8.647 0 0 1 10 15.833c-5.833 0-8.333-5.833-8.333-5.833a15.24 15.24 0 0 1 3.14-4.427m9.026 9.06L1.667 1.667m6.14 6.14a2.5 2.5 0 0 0 3.536 3.536"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

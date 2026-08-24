import type { SVGProps } from "react";

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M10 2.5c-2.53 0-4.583 2.052-4.583 4.583v2.144c0 .506-.213 1.246-.478 1.665l-.973 1.549c-.596.951-.19 2.007.86 2.362 3.42 1.155 7.363 1.155 10.783 0 .98-.33 1.42-1.482.858-2.362l-.973-1.549c-.262-.419-.475-1.16-.475-1.665V7.083C15.019 4.553 12.53 2.5 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.53 16.408a1.762 1.762 0 0 1-3.06 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

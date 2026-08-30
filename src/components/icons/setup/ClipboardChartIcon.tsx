import type { SVGProps } from "react";

export function ClipboardChartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path
        d="M7.5 3.333h5c.46 0 .833.373.833.834v.833c0 .46-.373.833-.833.833h-5A.833.833 0 0 1 6.667 5v-.833c0-.46.373-.834.833-.834Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.333 4.167h1.25c.92 0 1.667.746 1.667 1.666v10c0 .92-.746 1.667-1.667 1.667H5.417c-.92 0-1.667-.746-1.667-1.667v-10c0-.92.746-1.666 1.667-1.666h1.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.083 14.167v-2.5M10 14.167V9.583M12.917 14.167v-4.584"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

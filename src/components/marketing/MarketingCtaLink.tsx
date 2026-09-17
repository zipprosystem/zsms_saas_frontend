import Link from "next/link";
import type { ReactNode } from "react";

export function MarketingCtaLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-12 items-center justify-center rounded-md bg-accent px-6 text-base font-medium text-on-accent transition-colors hover:bg-accent-hover ${className}`}
    >
      {children}
    </Link>
  );
}

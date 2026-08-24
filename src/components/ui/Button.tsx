import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "accent";
  icon?: ReactNode;
}

export function Button({
  variant = "accent",
  icon,
  children,
  className,
  ...buttonProps
}: ButtonProps) {
  const variantClass =
    variant === "accent"
      ? "bg-accent text-on-accent hover:bg-accent-hover"
      : "";

  return (
    <button
      className={`flex h-14 items-center justify-center gap-2 rounded-md px-3 text-base font-normal transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantClass} ${className ?? ""}`}
      {...buttonProps}
    >
      {children}
      {icon}
    </button>
  );
}

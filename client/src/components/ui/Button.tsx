// client/src/components/ui/Button.tsx

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;

  size?: ButtonSize;

  loading?: boolean;

  children: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",

  secondary: "bg-white/8 text-white hover:bg-white/12",

  ghost: "bg-transparent text-zinc-300 hover:bg-white/8 hover:text-white",

  danger: "bg-danger text-white hover:bg-danger/90",

  outline: "border border-border bg-transparent text-zinc-200 hover:bg-white/5",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",

  md: "h-10 px-4 text-sm",

  lg: "h-11 px-5 text-sm",

  icon: "h-10 w-10",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg",
        "font-medium transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-primary/50",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}

      {children}
    </button>
  );
}
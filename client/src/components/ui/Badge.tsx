// client/src/components/ui/Badge.tsx

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  children: ReactNode;

  variant?: BadgeVariant;

  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-white/8 text-zinc-300",

  success: "bg-success/10 text-success",

  warning: "bg-warning/10 text-warning",

  danger: "bg-danger/10 text-danger",

  info: "bg-info/10 text-info",
};

export function Badge({
  children,
  variant = "default",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full",
        "px-2.5 py-1 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

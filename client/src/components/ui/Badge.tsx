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
  default: "border border-slate-200 bg-slate-100 text-slate-600",

  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",

  warning: "border border-amber-200 bg-amber-50 text-amber-800",

  danger: "border border-rose-200 bg-rose-50 text-rose-700",

  info: "border border-blue-200 bg-blue-50 text-blue-700",
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

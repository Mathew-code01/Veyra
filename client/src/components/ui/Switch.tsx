import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export function Switch({ label, checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        type="checkbox"
        className="w-4 h-4 rounded border border-border bg-black/20 text-primary focus:ring-primary"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      {label && <label className="text-sm text-zinc-200">{label}</label>}
    </div>
  );
}

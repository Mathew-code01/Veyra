// client/src/components/ui/Input.tsx

import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;

  error?: string;
}

export function Input({ label, error, id, className, ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-zinc-200">
          {label}
        </label>
      )}

      <input
        id={id}
        className={cn(
          "h-10 w-full rounded-lg border border-border",
          "bg-black/20 px-3 text-sm text-white",
          "placeholder:text-zinc-600",
          "outline-none transition",
          "focus:border-primary/70",
          "focus:ring-2 focus:ring-primary/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-danger/70",
          className,
        )}
        {...props}
      />

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

import type { TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;

  error?: string;
}

export function Textarea({ label, error, id, className, ...props }: TextareaProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-zinc-200">
          {label}
        </label>
      )}

      <textarea
        id={id}
        className={cn(
          "h-20 w-full rounded-lg border border-border",
          "bg-black/20 px-3 py-2 text-sm text-white",
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

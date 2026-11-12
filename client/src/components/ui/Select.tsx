import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type SelectItemProps = {
  value: string;
  children: ReactNode;
};

export interface SelectProps {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}

export function Select({
  label,
  value,
  onValueChange,
  children,
}: SelectProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-zinc-200">
          {label}
        </label>
      )}
      <select
        className="h-10 w-full rounded-lg border border-border bg-black/20 px-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-primary/70 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}

export function SelectItem({
  value,
  children,
}: SelectItemProps) {
  return (
    <option value={value}>
      {children}
    </option>
  );
}

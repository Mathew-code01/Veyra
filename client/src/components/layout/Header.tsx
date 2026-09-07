// client/src/components/layout/Header.tsx

import { CircleHelp, Command, Wifi } from "lucide-react";

import { Badge } from "@/components/ui/Badge";

export function Header() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-black/10 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Command size={13} />

          <span className="hidden sm:inline">Veyra Workspace</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="success">
          <Wifi size={11} />
          Ready
        </Badge>

        <button
          type="button"
          aria-label="Help"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-white/5 hover:text-white"
        >
          <CircleHelp size={17} />
        </button>
      </div>
    </header>
  );
}
// client/src/components/layout/Header.tsx

import { ArrowRight, Command, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";

export function Header() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Command size={13} />

          <span className="hidden sm:inline">Veyra Workspace</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="default"><Command size={11} /> Desktop workspace</Badge>

        <Link to="/interview/setup" className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90 sm:px-4 sm:text-sm"><span className="hidden sm:inline">New practice</span><span className="sm:hidden">Practice</span><ArrowRight size={15} /></Link>
        <Link to="/settings" aria-label="Open settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><Settings2 size={17} /></Link>
      </div>
    </header>
  );
}

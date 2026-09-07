// client/src/components/layout/Sidebar.tsx

import {
  BarChart3,
  Brain,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  Settings,
  Sparkles,
  UserRound,
} from "lucide-react";

import { NavLink } from "react-router-dom";

import { cn } from "@/lib/cn";

const navigation = [
  {
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Preparation",
    path: "/preparation",
    icon: Sparkles,
  },
  {
    label: "Documents",
    path: "/documents",
    icon: FileText,
  },
  {
    label: "Projects",
    path: "/projects",
    icon: FolderKanban,
  },
  {
    label: "Profile",
    path: "/profile",
    icon: UserRound,
  },
  {
    label: "History",
    path: "/history",
    icon: History,
  },
  {
    label: "Analytics",
    path: "/analytics",
    icon: BarChart3,
  },
];

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 border-r border-border bg-black/20 lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <Brain size={17} />
        </div>

        <div>
          <p className="text-sm font-semibold">Veyra</p>

          <p className="text-[10px] text-zinc-500">Interview Copilot</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navigation.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-lg px-3",
                  "text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white",
                )
              }
            >
              <Icon size={17} />

              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex h-10 items-center gap-3 rounded-lg px-3",
              "text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-zinc-400 hover:bg-white/5 hover:text-white",
            )
          }
        >
          <Settings size={17} />

          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
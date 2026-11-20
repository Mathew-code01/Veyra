// client/src/components/layout/Sidebar.tsx

import {

  FileText,
  FolderKanban,
  History,
  Mic,
  BrainCircuit,
  LayoutDashboard,
  Settings,
  Sparkles,
  UserRound,
  CircleUserRound,
  ClipboardCheck,
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
    label: "Practice",
    path: "/practice",
    icon: BrainCircuit,
  },
  {
    label: "Live copilot",
    path: "/live",
    icon: Mic,

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
  { label: "Assessments", path: "/assessments", icon: ClipboardCheck },
  { label: "Account", path: "/account", icon: CircleUserRound },
];

export function Sidebar() {
  return (
    <>
    <aside className="hidden h-screen w-[236px] shrink-0 border-r border-border bg-white lg:flex lg:flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <img src="./veyra-mark.svg" alt="" className="h-8 w-8 shrink-0" />

        <div>
          <p className="text-sm font-semibold">Veyra</p>

          <p className="text-[10px] text-slate-500">Interview Copilot</p>
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
                    ? "bg-[#EAE4FF] text-[#5638C4] ring-1 ring-[#D6CBFF]"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
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
                ? "bg-[#EAE4FF] text-[#5638C4] ring-1 ring-[#D6CBFF]"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-950",
            )
          }
        >
          <Settings size={17} />

          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_28px_-24px_rgba(15,23,42,0.45)] backdrop-blur lg:hidden">
      {navigation.filter((item) => ["/", "/practice", "/assessments", "/live", "/history", "/account"].includes(item.path)).map((item) => {
        const Icon = item.icon;
        return <NavLink key={item.path} to={item.path} end={item.path === "/"} className={({ isActive }) => cn("flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-medium", isActive ? "text-indigo-800" : "text-slate-500")}>
          <Icon size={18} /><span className="max-w-full truncate">{item.label}</span>
        </NavLink>;
      })}
    </nav>
    </>
  );
}

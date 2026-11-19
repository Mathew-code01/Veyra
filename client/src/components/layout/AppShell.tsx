// client/src/components/layout/AppShell.tsx

import type { ReactNode } from "react";

import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-theme-light flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />

        <div className="min-h-0 flex-1 overflow-y-auto pb-20 lg:pb-0">{children}</div>
      </div>
    </div>
  );
}
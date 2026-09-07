import { createBrowserRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";

import { Dashboard } from "@/pages/Dashboard/Dashboard";
import { Preparation } from "@/pages/Preparation/Preparation";
import { Documents } from "@/pages/Documents/Documents";
import { Profile } from "@/pages/Profile/Profile";

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AppShell>
        <Dashboard />
      </AppShell>
    ),
  },
  {
    path: "/preparation",
    element: (
      <AppShell>
        <Preparation />
      </AppShell>
    ),
  },
  {
    path: "/documents",
    element: (
      <AppShell>
        <Documents />
      </AppShell>
    ),
  },
  {
    path: "/profile",
    element: (
      <AppShell>
        <Profile />
      </AppShell>
    ),
  },
  {
    path: "/projects",
    element: (
      <AppShell>
        <Placeholder title="Projects" />
      </AppShell>
    ),
  },
  {
    path: "/history",
    element: (
      <AppShell>
        <Placeholder title="Interview History" />
      </AppShell>
    ),
  },
  {
    path: "/analytics",
    element: (
      <AppShell>
        <Placeholder title="Analytics" />
      </AppShell>
    ),
  },
  {
    path: "/settings",
    element: (
      <AppShell>
        <Placeholder title="Settings" />
      </AppShell>
    ),
  },
]);

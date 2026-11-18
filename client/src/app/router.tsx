import { createBrowserRouter, createHashRouter } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";

import { Dashboard } from "@/pages/Dashboard/Dashboard";
import { Documents } from "@/pages/Documents/Documents";
import { Experience } from "@/pages/Profile/Experience";
import { Preparation } from "@/pages/Preparation/Preparation";
import { Profile } from "@/pages/Profile/Profile";
import { Projects } from "@/pages/Projects/Projects";
import { Skills } from "@/pages/Profile/Skills";
import { Stories } from "@/pages/Stories/Stories";
import { Settings } from "@/pages/Settings/Settings";
import { History } from "@/pages/History/History";
import { SessionDetails } from "@/pages/History/SessionDetails";
import { InterviewSetup } from "@/pages/InterviewSetup/InterviewSetup";
import { LiveInterview } from "@/pages/LiveInterview/LiveInterview";
import { QuestionPractice } from "@/pages/Preparation/QuestionPractice";
import { CopilotOverlay } from "@/features/overlay/CopilotOverlay";
import { Account } from "@/pages/Account/Account";
import { Onboarding } from "@/pages/Onboarding/Onboarding";
import { Assessments } from "@/pages/Assessments/Assessments";
import { useEffect, useState } from "react";

function EntryGate() {
  const [destination, setDestination] = useState<"checking" | "onboarding" | "app">("checking");
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (localStorage.getItem("veyra.firstLaunch.setupComplete") !== "true") {
        if (active) setDestination("onboarding");
        return;
      }
      if (!window.veyra?.platform?.getState) {
        if (active) setDestination("onboarding");
        return;
      }
      try {
        const state = await window.veyra.platform.getState();
        if (!state.authenticated) throw new Error("not signed in");
        try {
          if (!window.veyra?.platform?.refreshAccount) throw new Error("platform unavailable");
          const account = await window.veyra.platform.refreshAccount();
          if (account.authorization !== "authorized") throw new Error(account.authorization === "revoked" ? "device revoked" : "device not authorized");
        } catch (error) {
          const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
          const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
          if (status === 401 || status === 403 || ["DEVICE_REVOKED", "UNAUTHORIZED", "SESSION_EXPIRED"].includes(code)) throw error;
          // Local capabilities remain available during a network outage.
        }
        if (active) setDestination("app");
      } catch {
        if (active) setDestination("onboarding");
      }
    };
    const complete = () => setDestination("app");
    window.addEventListener("veyra:setup-complete", complete);
    void check();
    return () => { active = false; window.removeEventListener("veyra:setup-complete", complete); };
  }, []);
  if (destination === "checking") return <div className="grid min-h-screen place-items-center bg-[#f8f8fc] text-sm text-slate-500">Checking your VEYRA account…</div>;
  return destination === "app" ? <AppShell><Dashboard /></AppShell> : <Onboarding />;
}

const applicationRoutes = [
  { path: "/", element: <EntryGate /> },
  { path: "/preparation", element: <AppShell><Preparation /></AppShell> },
  { path: "/interview/setup", element: <AppShell><InterviewSetup /></AppShell> },
  { path: "/practice", element: <AppShell><QuestionPractice /></AppShell> },
  { path: "/live", element: <AppShell><LiveInterview /></AppShell> },
  { path: "/documents", element: <AppShell><Documents /></AppShell> },
  { path: "/profile", element: <AppShell><Profile /></AppShell> },
  { path: "/profile/experience", element: <AppShell><Experience /></AppShell> },
  { path: "/profile/skills", element: <AppShell><Skills /></AppShell> },
  { path: "/projects", element: <AppShell><Projects /></AppShell> },
  { path: "/stories", element: <AppShell><Stories /></AppShell> },
  { path: "/history", element: <AppShell><History /></AppShell> },
  { path: "/history/:sessionId", element: <AppShell><SessionDetails /></AppShell> },
  { path: "/assessments", element: <AppShell><Assessments /></AppShell> },
  { path: "/analytics", element: <AppShell><Assessments /></AppShell> },
  { path: "/settings", element: <AppShell><Settings /></AppShell> },
  { path: "/ai-setup", element: <Onboarding initialStep={2} /> },
  { path: "/account", element: <AppShell><Account /></AppShell> },
  { path: "/overlay", element: <CopilotOverlay /> },
];

export const router = window.location.hash.startsWith("#/overlay")
  ? createHashRouter([{ path: "/overlay", element: <CopilotOverlay /> }])
  : createBrowserRouter(applicationRoutes);

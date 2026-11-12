import { createBrowserRouter } from "react-router-dom";

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

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">This workspace is not implemented in this build.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/", element: <AppShell><Dashboard /></AppShell> },
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
  { path: "/analytics", element: <AppShell><Placeholder title="Analytics" /></AppShell> },
  { path: "/settings", element: <AppShell><Settings /></AppShell> },
]);

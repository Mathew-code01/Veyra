// client/src/pages/Dashboard/Dashboard.tsx

import { ArrowRight, Brain, FileText, Mic, Sparkles } from "lucide-react";

import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader } from "@/components/ui/Card";

import { Badge } from "@/components/ui/Badge";

import { Button } from "@/components/ui/Button";

import { PageContainer } from "@/components/layout/PageContainer";

const features = [
  {
    title: "Prepare an interview",
    description:
      "Build your candidate context, select the interview type and configure your session.",
    icon: Sparkles,
    path: "/preparation",
  },
  {
    title: "Candidate knowledge",
    description:
      "Manage your resume, projects, skills and professional experience.",
    icon: Brain,
    path: "/profile",
  },
  {
    title: "Documents",
    description:
      "Import and organize resumes, job descriptions and supporting documents.",
    icon: FileText,
    path: "/documents",
  },
];

export function Dashboard() {
  return (
    <PageContainer>
      <section className="mb-8">
        <div className="max-w-3xl">
          <Badge variant="info">
            <Mic size={11} />
            Interview workspace
          </Badge>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Prepare with context.
            <br />
            Perform with confidence.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Veyra combines your professional context, interview requirements and
            AI assistance into one privacy-conscious workspace.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/preparation">
              <Button>
                Start preparation
                <ArrowRight size={16} />
              </Button>
            </Link>

            <Link to="/documents">
              <Button variant="outline">Import documents</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;

          return (
            <Link key={feature.title} to={feature.path} className="group">
              <Card className="h-full transition-colors hover:border-primary/30">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon size={19} />
                  </div>

                  <h2 className="mt-2 text-base font-semibold text-white">
                    {feature.title}
                  </h2>
                </CardHeader>

                <CardContent>
                  <p className="text-sm leading-6 text-zinc-500">
                    {feature.description}
                  </p>

                  <div className="mt-5 flex items-center gap-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open workspace
                    <ArrowRight size={13} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </PageContainer>
  );
}
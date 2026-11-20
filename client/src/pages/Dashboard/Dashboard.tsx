import { useEffect, useState } from "react";
import { ArrowRight, Cpu, History, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";

type ProviderStatus = {
  executionMode: string;
  providers: readonly { providerId: string; configured: boolean }[];
};

type DashboardSession = {
  id: string;
  title?: string;
  targetRole?: string;
  status?: string;
  questionsAnswered?: number;
  questionCount?: number;
  domain?: string;
};

export function Dashboard() {
  const [recent, setRecent] = useState<readonly DashboardSession[]>([]);
  const [provider, setProvider] = useState<ProviderStatus>();
  const [providerError, setProviderError] = useState<string>();
  const [hardware, setHardware] = useState<{ localRuntimeReady: boolean; runtimeNames: readonly string[] }>();
  const [hardwareError, setHardwareError] = useState<string>();
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const practice = window.veyra?.practice;
      if (practice?.listSessions) {
        try {
          const result = await practice.listSessions({});
          if (!cancelled && result.success) setRecent((result.data ?? []).slice(0, 5));
        } catch {
          // The session panel keeps its unavailable state when IPC fails.
        } finally {
          if (!cancelled) setSessionsLoaded(true);
        }
      } else {
        setSessionsLoaded(true);
      }

      const providers = window.veyra?.providers;
      if (providers?.getStatus) {
        try {
          const result = await providers.getStatus();
          if (!result.success || !result.data) throw new Error(result.error?.message);
          if (!cancelled) setProvider(result.data);
        } catch (error) {
          if (!cancelled) setProviderError(error instanceof Error ? error.message : "Provider status is unavailable.");
        }
      } else if (!cancelled) {
        setProviderError("Open VEYRA Desktop to load provider status.");
      }

      const hardwareApi = window.veyra?.hardware;
      if (hardwareApi?.getAssessment) {
        try {
          const result = await hardwareApi.getAssessment();
          if (!cancelled) setHardware({ localRuntimeReady: result.localRuntimeReady, runtimeNames: result.runtimeNames });
        } catch (error) {
          if (!cancelled) setHardwareError(error instanceof Error ? error.message : "Hardware assessment is unavailable.");
        }
      } else if (!cancelled) {
        setHardwareError("Hardware assessment requires VEYRA Desktop.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const configuredProviders = provider?.providers.filter((item) => item.configured).length;
  const providerCount = provider?.providers.length;

  return (
    <PageContainer>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-subtle">Your workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground">Overview</h1>
          <p className="mt-1 text-sm text-ink-muted">Your session readiness and recent practice, in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/interview/setup"><Button variant="outline">Practice</Button></Link>
          <Link to="/live"><Button>Start Live Copilot <ArrowRight size={15} /></Button></Link>
        </div>
      </header>

      <section aria-label="Workspace status" className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard icon={Sparkles} label="Execution mode" value={provider?.executionMode ?? (providerError ? "Unavailable" : "Loading…")} detail="Current AI preference" />
        <StatusCard icon={ShieldCheck} label="Configured providers" value={provider ? `${configuredProviders} of ${providerCount}` : providerError ? "Unavailable" : "Loading…"} detail={providerError ?? "Credentials remain in secure desktop storage."} />
        <StatusCard icon={Cpu} label="Local runtime" value={hardware ? hardware.localRuntimeReady ? "Ready" : "Not ready" : hardwareError ? "Unavailable" : "Checking…"} detail={hardware ? hardware.runtimeNames.length ? hardware.runtimeNames.join(", ") : "No available runtime reported." : hardwareError ?? "Checking this device…"} />
        <StatusCard icon={Mic} label="Capture" value="User controlled" detail="Microphone and screen capture start only when you enable a feature." />
      </section>

      <section aria-label="Get started" className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center gap-2 text-brand-strong"><Mic size={17} /><h2 className="text-base font-semibold text-foreground">Live Copilot</h2></div>
            <p className="text-sm leading-5 text-ink-muted">Review readiness before you choose to start capture. Microphone and screen access stay off until enabled.</p>
            <div className="flex flex-wrap gap-2"><Badge variant="default">User controlled</Badge><Badge variant="info">Pre-flight available</Badge></div>
            <Link to="/preparation" className="pt-1"><Button variant="secondary">Open pre-flight <ArrowRight size={14} /></Button></Link>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center gap-2 text-brand-strong"><Sparkles size={17} /><h2 className="text-base font-semibold text-foreground">Practice Studio</h2></div>
            <p className="text-sm leading-5 text-ink-muted">Set up a practice session, choose its format, and review feedback after you finish.</p>
            <div className="flex flex-wrap gap-2"><Badge variant="default">Text and voice options depend on setup</Badge></div>
            <Link to="/interview/setup" className="pt-1"><Button variant="outline">Set up practice <ArrowRight size={14} /></Button></Link>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2 text-brand-strong"><History size={17} /><h2 className="text-base font-semibold text-foreground">Recent sessions</h2></div>
          <Link to="/history" className="text-xs font-medium text-brand-strong hover:underline">View history</Link>
        </CardHeader>
        <CardContent>
          {!sessionsLoaded ? <p role="status" className="py-3 text-sm text-ink-subtle">Loading session history…</p> : recent.length === 0 ? (
            <p className="py-3 text-sm text-ink-subtle">No practice sessions are available for this profile yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-border text-xs font-medium text-ink-subtle"><th className="py-2 pr-4">Session</th><th className="py-2 pr-4">Type</th><th className="py-2 pr-4">Progress</th><th className="py-2 text-right"> </th></tr></thead>
                <tbody>{recent.map((session) => <tr key={session.id} className="border-b border-border last:border-0">
                  <td className="max-w-[260px] truncate py-3 pr-4 font-medium text-foreground">{session.title ?? session.targetRole ?? "Practice session"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{session.domain ?? "Practice"}</td>
                  <td className="py-3 pr-4 text-ink-muted">{session.status ?? "Saved"}{typeof session.questionsAnswered === "number" ? ` · ${session.questionsAnswered}/${session.questionCount ?? "?"}` : ""}</td>
                  <td className="py-3 text-right"><Link to={`/history/${encodeURIComponent(session.id)}`} className="text-xs font-medium text-brand-strong hover:underline">Review</Link></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function StatusCard({ icon: Icon, label, value, detail }: { icon: typeof Sparkles; label: string; value: string; detail: string }) {
  return <Card><CardContent className="flex min-h-[112px] gap-3 p-4">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand-strong"><Icon size={17} /></span>
    <div className="min-w-0"><p className="text-xs text-ink-subtle">{label}</p><p className="mt-1 truncate text-base font-semibold text-foreground">{value}</p><p className="mt-1 line-clamp-2 text-xs leading-4 text-ink-subtle">{detail}</p></div>
  </CardContent></Card>;
}

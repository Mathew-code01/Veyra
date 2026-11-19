import { useEffect, useState } from "react";
import { ArrowRight, Brain, FileText, History, Mic, Settings, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";

export function Dashboard() {
  const [recent, setRecent] = useState<readonly any[]>([]);
  const [provider, setProvider] = useState<any>();
  const [statusNote, setStatusNote] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const practice = (window as any).veyra?.practice;
        if (practice?.listSessions) {
          const res = await practice.listSessions({});
          if (!cancelled && res?.success) setRecent((res.data ?? []).slice(0, 5));
        }
      } catch { /* best-effort */ }
      try {
        const providers = (window as any).veyra?.providers;
        if (providers?.getStatus) {
          const res = await providers.getStatus();
          if (!cancelled && res?.success) setProvider(res.data);
        }
      } catch { /* best-effort */ }
      if (!cancelled) setStatusNote("Live capture, transcription and vision depend on available hardware and only start when you explicitly enable them.");
    })();
    return () => { cancelled = true; };
  }, []);

  const executionMode = provider?.executionMode ?? "unknown";

  return (
    <PageContainer>
      <section className="relative isolate mb-8 overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-white via-white to-indigo-50 p-6 shadow-[0_24px_70px_-50px_rgba(49,46,129,0.45)] sm:p-9">
        <div className="relative z-10 max-w-3xl">
          <Badge variant="info"><Mic size={11} />Interview workspace</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">Prepare with context.<br />Perform with confidence.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
            Set up a focused practice session, organize the experience you want to draw on, and review your progress in one private desktop workspace.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/interview/setup"><Button>Start a practice session <ArrowRight size={16} /></Button></Link>
            <Link to="/preparation"><Button variant="outline">Preparation setup</Button></Link>
            <Link to="/documents"><Button variant="outline">Import documents</Button></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><div className="flex items-center gap-2 text-primary"><Brain size={18} /><h2 className="text-base font-semibold text-slate-950">AI / provider status</h2></div></CardHeader><CardContent className="text-sm text-slate-600 space-y-2">
          <div>Execution mode: <span className="text-slate-800">{String(executionMode)}</span></div>
          <div>Configured providers: <span className="text-slate-800">{(provider?.providers ?? []).filter((p:any)=>p.configured).length}</span> / {(provider?.providers ?? []).length || "not available"}</div>
          <div className="text-xs text-slate-500">BYOK credentials stay in OS-backed main-process storage; cloud execution denied by default without consent/authorization/entitlement/quota checks.</div>
          <Link to="/settings" className="inline-flex items-center gap-1 text-primary text-xs"><Settings size={13}/> Open settings</Link>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><div className="flex items-center gap-2 text-primary"><History size={18} /><h2 className="text-base font-semibold text-slate-950">Recent practice sessions</h2></div></CardHeader><CardContent className="text-sm">
          {recent.length === 0 ? <p className="text-slate-500">No recent practice sessions found for the active profile.</p> : (
            <ul className="space-y-2">
              {recent.map((s:any) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-slate-50 px-3 py-2">
                  <div className="min-w-0"><div className="text-slate-800 truncate">{s.title ?? s.targetRole ?? s.id}</div><div className="text-xs text-slate-500">{s.status} | {s.questionsAnswered ?? 0}/{s.questionCount ?? "?"} | {s.domain ?? "not set"}</div></div>
                  <Link to={`/history/${encodeURIComponent(s.id)}`} className="text-xs text-primary">Review</Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-3 text-xs"><Link to="/history" className="text-primary">View history</Link><Link to="/practice" className="text-primary">Open practice workspace</Link></div>
        </CardContent></Card>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-3">
        {[{title:"Candidate context",desc:"Manage profile, skills, experience and evidence used by interview guidance.",icon:Brain,path:"/profile"},{title:"Documents",desc:"Import and index resumes/job descriptions locally for grounded preparation.",icon:FileText,path:"/documents"},{title:"Live assistance",desc:"User-controlled live workspace with explicit capture/transcription status and grounded guidance.",icon:Mic,path:"/live"}].map(f=>{const Icon=f.icon; return (
          <Link key={f.title} to={f.path} className="group"><Card className="h-full transition-colors hover:border-primary/30"><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={19}/></div><h2 className="mt-2 text-base font-semibold text-slate-950">{f.title}</h2></CardHeader><CardContent><p className="text-sm leading-6 text-slate-500">{f.desc}</p><div className="mt-5 flex items-center gap-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowRight size={13}/></div></CardContent></Card></Link>
        );})}
      </section>

      {statusNote && <p className="mt-4 text-xs text-slate-500">{statusNote}</p>}
    </PageContainer>
  );
}

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
      if (!cancelled) setStatusNote("Live audio/transcription and vision inference require supported hardware/authorized pipelines and are user-initiated; cloud AI is fail-closed unless authorized and consented.");
    })();
    return () => { cancelled = true; };
  }, []);

  const executionMode = provider?.executionMode ?? "unknown";

  return (
    <PageContainer>
      <section className="mb-8">
        <div className="max-w-3xl">
          <Badge variant="info"><Mic size={11} />Interview workspace</Badge>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Prepare with context.<br />Perform with confidence.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
            Veyra combines candidate context, interview runtime intelligence, and user-controlled assistance. Real services are accessed via secure Electron IPC; unavailable hardware/providers are reported honestly.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/interview/setup"><Button>Start live/practice session <ArrowRight size={16} /></Button></Link>
            <Link to="/preparation"><Button variant="outline">Preparation setup</Button></Link>
            <Link to="/documents"><Button variant="outline">Import documents</Button></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><div className="flex items-center gap-2 text-primary"><Brain size={18} /><h2 className="text-base font-semibold text-white">AI / provider status</h2></div></CardHeader><CardContent className="text-sm text-zinc-400 space-y-2">
          <div>Execution mode: <span className="text-zinc-200">{String(executionMode)}</span></div>
          <div>Configured providers: <span className="text-zinc-200">{(provider?.providers ?? []).filter((p:any)=>p.configured).length}</span> / {(provider?.providers ?? []).length || "—"}</div>
          <div className="text-xs text-zinc-500">BYOK credentials stay in OS-backed main-process storage; cloud execution denied by default without consent/authorization/entitlement/quota checks.</div>
          <Link to="/settings" className="inline-flex items-center gap-1 text-primary text-xs"><Settings size={13}/> Open settings</Link>
        </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><div className="flex items-center gap-2 text-primary"><History size={18} /><h2 className="text-base font-semibold text-white">Recent practice sessions</h2></div></CardHeader><CardContent className="text-sm">
          {recent.length === 0 ? <p className="text-zinc-500">No recent practice sessions found for the active profile.</p> : (
            <ul className="space-y-2">
              {recent.map((s:any) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-black/20 px-3 py-2">
                  <div className="min-w-0"><div className="text-zinc-200 truncate">{s.title ?? s.targetRole ?? s.id}</div><div className="text-xs text-zinc-500">{s.status} · {s.questionsAnswered ?? 0}/{s.questionCount ?? "?"} · {s.domain ?? "—"}</div></div>
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
          <Link key={f.title} to={f.path} className="group"><Card className="h-full transition-colors hover:border-primary/30"><CardHeader><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={19}/></div><h2 className="mt-2 text-base font-semibold text-white">{f.title}</h2></CardHeader><CardContent><p className="text-sm leading-6 text-zinc-500">{f.desc}</p><div className="mt-5 flex items-center gap-2 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">Open <ArrowRight size={13}/></div></CardContent></Card></Link>
        );})}
      </section>

      {statusNote && <p className="mt-4 text-xs text-zinc-500">{statusNote}</p>}
    </PageContainer>
  );
}

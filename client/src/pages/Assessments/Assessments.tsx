import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardCheck, RefreshCw, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type AssessmentRow = { session: any; report?: any };

export function Assessments() {
  const [rows, setRows] = useState<AssessmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const api = window.veyra?.practice;
      if (!api?.listSessions || !api.getReport) throw new Error("Assessment services are unavailable. Open this workspace in Veyra Desktop.");
      const result = await api.listSessions({});
      if (!result?.success) throw new Error(result?.error?.message ?? "Could not load practice assessments.");
      const sessions = (result.data ?? []).slice(0, 100);
      const completed = await Promise.all(sessions.map(async (session: any) => {
        if (session.status !== "completed") return { session };
        const report = await api.getReport({ sessionId: session.id });
        return { session, report: report?.success ? report.data : undefined };
      }));
      setRows(completed);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load practice assessments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  const scored = useMemo(() => rows.filter((row) => Number.isFinite(row.report?.overallScore)), [rows]);
  const average = scored.length ? Math.round(scored.reduce((sum, row) => sum + row.report.overallScore, 0) / scored.length) : undefined;

  return <PageContainer>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-700">Practice results</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Assessments</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review feedback from completed practice sessions. Results are stored locally and scoped to the active candidate profile.</p></div>
      <Button variant="outline" onClick={() => void load()} loading={loading}><RefreshCw size={15}/> Refresh</Button>
    </header>

    {error && <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">{error}</div>}

    <section className="mt-6 grid gap-4 sm:grid-cols-2">
      <Card><CardHeader><div className="flex items-center gap-2 text-indigo-700"><ClipboardCheck size={18}/><h2 className="text-sm font-semibold text-slate-800">Completed assessments</h2></div></CardHeader><CardContent><p className="text-3xl font-semibold text-slate-950">{loading ? "—" : scored.length}</p><p className="mt-1 text-xs text-slate-500">Sessions with a saved evaluation report</p></CardContent></Card>
      <Card><CardHeader><div className="flex items-center gap-2 text-indigo-700"><Target size={18}/><h2 className="text-sm font-semibold text-slate-800">Average score</h2></div></CardHeader><CardContent><p className="text-3xl font-semibold text-slate-950">{loading || average === undefined ? "—" : `${average}/100`}</p><p className="mt-1 text-xs text-slate-500">Calculated from saved practice reports</p></CardContent></Card>
    </section>

    <Card className="mt-6"><CardHeader><h2 className="font-semibold text-slate-900">Recent practice evaluations</h2><p className="text-sm text-slate-500">Open a session to review its answer feedback and report.</p></CardHeader><CardContent>
      {loading ? <p className="text-sm text-slate-500" aria-live="polite">Loading saved sessions…</p> : rows.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-7 text-center"><p className="font-medium text-slate-800">No practice assessments yet</p><p className="mt-1 text-sm text-slate-500">Complete a practice session to see your feedback here.</p><Link to="/practice"><Button className="mt-4">Start practice <ArrowRight size={15}/></Button></Link></div> : <ul className="divide-y divide-slate-100">{rows.map(({ session, report }) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{session.title ?? session.targetRole ?? "Practice session"}</p><p className="mt-1 text-xs text-slate-500">{session.status} · {session.questionsAnswered ?? 0}/{session.questionCount ?? "?"} answered · {session.domain ?? "General"}</p></div><div className="flex items-center gap-3"><span className="text-sm font-semibold text-slate-700">{Number.isFinite(report?.overallScore) ? `${report.overallScore}/100` : session.status === "completed" ? "Report unavailable" : "In progress"}</span><Link to={`/history/${encodeURIComponent(session.id)}`}><Button size="sm" variant="outline">Review</Button></Link></div></li>)}</ul>}
    </CardContent></Card>
  </PageContainer>;
}

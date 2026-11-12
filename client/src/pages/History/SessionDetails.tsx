import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function SessionDetails() {
  const { sessionId = "" } = useParams();
  const [state, setState] = useState<any>();
  const [report, setReport] = useState<any>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const practice = (window as any).veyra?.practice;
  const runtime = (window as any).veyra?.runtime;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(undefined);
      try {
        if (practice?.getSession) {
          const res = await practice.getSession({ sessionId });
          if (res?.success && !cancelled) setState(res.data);
          const rep = await practice.getReport?.({ sessionId });
          if (rep?.success && !cancelled) setReport(rep.data);
        } else if (runtime?.getState) {
          const res = await runtime.getState({ sessionId });
          if (res?.success && !cancelled) setState(res.data);
        } else {
          throw new Error("Session APIs unavailable.");
        }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load session."); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [sessionId, practice, runtime]);

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Session Details</h1>
          <p className="mt-2 text-sm text-zinc-500">Persisted session state and available report data. Live transcript storage and full post-interview analytics are partially implemented and depend on runtime/persistence coverage.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/history"><Button variant="outline">Back</Button></Link>
          <Link to={`/practice?sessionId=${encodeURIComponent(sessionId)}`}><Button>Open in practice</Button></Link>
        </div>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {loading ? <p className="mt-6 text-sm text-zinc-400">Loading session…</p> : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><h2 className="font-medium">State</h2></CardHeader><CardContent className="pt-2 text-sm space-y-2">
            {!state ? <p className="text-zinc-500">No session state available.</p> : (
              <>
                <div><span className="text-zinc-400">Session ID:</span> <span className="text-zinc-200 break-all">{state.id ?? state.sessionId}</span></div>
                <div><span className="text-zinc-400">Status:</span> <span className="text-zinc-200">{state.status}</span></div>
                {state.mode && <div><span className="text-zinc-400">Mode:</span> <span className="text-zinc-200">{state.mode}</span></div>}
                {state.targetRole && <div><span className="text-zinc-400">Target role:</span> <span className="text-zinc-200">{state.targetRole}</span></div>}
                {state.domain && <div><span className="text-zinc-400">Domain:</span> <span className="text-zinc-200">{state.domain}</span></div>}
                {state.questionCount != null && <div><span className="text-zinc-400">Progress:</span> <span className="text-zinc-200">{state.questionsAnswered ?? 0}/{state.questionCount}</span></div>}
                {state.currentQuestion?.text && <div><div className="text-zinc-400 mt-2">Current/last question</div><div className="text-zinc-200">{state.currentQuestion.text}</div></div>}
              </>
            )}
          </CardContent></Card>
          <Card><CardHeader><h2 className="font-medium">Report / insights</h2></CardHeader><CardContent className="pt-2 text-sm space-y-2">
            {!report ? <p className="text-zinc-500">No completed report available for this session yet. Complete a practice session to generate one.</p> : (
              <>
                <div><span className="text-zinc-400">Overall score:</span> <span className="text-zinc-200">{report.overallScore}/100</span></div>
                <p className="text-zinc-300">{report.overallAssessment}</p>
                {Array.isArray(report.strengths) && report.strengths.length > 0 && <div><div className="text-zinc-400">Strengths</div><ul className="list-disc pl-5 text-zinc-300">{report.strengths.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
                {Array.isArray(report.weaknesses) && report.weaknesses.length > 0 && <div><div className="text-zinc-400">Weaknesses</div><ul className="list-disc pl-5 text-zinc-300">{report.weaknesses.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
                {Array.isArray(report.recommendedLearningAreas) && report.recommendedLearningAreas.length > 0 && <div><div className="text-zinc-400">Recommended learning</div><ul className="list-disc pl-5 text-zinc-300">{report.recommendedLearningAreas.map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
                {report.suggestedNextSessionFocus && <div><span className="text-zinc-400">Next focus:</span> <span className="text-zinc-200">{report.suggestedNextSessionFocus}</span></div>}
              </>
            )}
          </CardContent></Card>
        </div>
      )}
    </PageContainer>
  );
}

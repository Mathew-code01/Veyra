import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type AnyState = any;

export function QuestionPractice() {
  const [params, setParams] = useSearchParams();
  const [sessionId, setSessionId] = useState(params.get("sessionId") ?? "");
  const [state, setState] = useState<AnyState>();
  const [answerText, setAnswerText] = useState("");
  const [result, setResult] = useState<any>();
  const [report, setReport] = useState<any>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [statusMsg, setStatusMsg] = useState<string>();

  const api = (window as any).veyra?.practice;
  const currentQuestion = state?.currentQuestion;

  const load = async (id: string) => {
    if (!id || !api) return;
    const res = await api.getSession({ sessionId: id });
    if (!res?.success) throw new Error(res?.error?.message ?? "Failed to load practice session.");
    setState(res.data);
    setSessionId(id);
    setParams({ sessionId: id });
  };

  useEffect(() => {
    const id = params.get("sessionId");
    if (id && api) void load(id).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createAndStart = async () => {
    setBusy(true); setError(undefined); setStatusMsg(undefined); setResult(undefined); setReport(undefined);
    try {
      if (!api) throw new Error("Practice API unavailable.");
      const created = await api.createSession({ targetRole: "Interview Candidate", questionCount: 5, interviewType: "mixed", domain: "general_employment" });
      if (!created?.success || !created?.data?.id) throw new Error(created?.error?.message ?? "Failed to create practice session.");
      await load(created.data.id);
      setStatusMsg("Practice session started.");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to start practice."); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!currentQuestion?.id || !sessionId) return;
    setBusy(true); setError(undefined); setStatusMsg(undefined);
    try {
      const res = await api.submitAnswer({ sessionId, questionId: currentQuestion.id, answerText });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to submit answer.");
      setResult(res.data);
      setAnswerText("");
      await load(sessionId);
      if (res.data?.isSessionCompleted) {
        const rep = await api.getReport({ sessionId });
        if (rep?.success) setReport(rep.data);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to submit answer."); }
    finally { setBusy(false); }
  };

  const pause = async () => { if (!sessionId) return; setBusy(true); try { await api.pauseSession({ sessionId }); await load(sessionId); } finally { setBusy(false); } };
  const resume = async () => { if (!sessionId) return; setBusy(true); try { await api.resumeSession({ sessionId }); await load(sessionId); } finally { setBusy(false); } };
  const complete = async () => {
    if (!sessionId) return; setBusy(true); setError(undefined);
    try {
      const rep = await api.completeSession({ sessionId });
      if (rep?.success) setReport(rep.data);
      await load(sessionId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to complete session."); }
    finally { setBusy(false); }
  };

  const evidenceNote = useMemo(() => {
    const missing = result?.evaluation?.gaps ?? result?.evaluation?.missedOpportunities;
    return Array.isArray(missing) ? missing.slice(0, 4) : [];
  }, [result]);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Practice Interview</h1>
          <p className="mt-2 text-sm text-zinc-500">Real practice session via Electron IPC and SQLite-backed practice engine. Evaluations are engine-generated from your submitted answer text.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/interview/setup"><Button variant="outline">Setup</Button></Link>
          <Button onClick={() => void createAndStart()} loading={busy && !sessionId}>New practice session</Button>
        </div>
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {statusMsg && <p role="status" className="mt-4 text-sm text-emerald-400">{statusMsg}</p>}
      {!api && <p className="mt-4 text-sm text-amber-400">Desktop practice API not available (run in the Veyra desktop app).</p>}

      {state && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2"><CardHeader><h2 className="font-medium">Current question</h2></CardHeader><CardContent className="pt-2 space-y-4">
            <div className="text-sm text-zinc-400">Session: <span className="text-zinc-200">{state.id}</span> · Status: <span className="text-zinc-200">{state.status}</span> · {state.questionsAnswered}/{state.questionCount} answered · Role: {state.targetRole ?? "—"} · Domain: {state.domain ?? "—"}</div>
            {currentQuestion ? (
              <>
                <div className="rounded-lg border border-border bg-black/20 p-4">
                  <div className="text-xs text-zinc-500 mb-2">Q{currentQuestion.sequenceNumber} {currentQuestion.isFollowUp ? "(follow-up)" : ""} · {currentQuestion.type}</div>
                  <p className="text-base text-white leading-7">{currentQuestion.text}</p>
                </div>
                <label className="block text-sm text-zinc-400">Your answer
                  <textarea className="mt-2 min-h-40 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={answerText} onChange={(e)=>setAnswerText(e.target.value)} placeholder="Type your response. Ground it in your real experience; Veyra does not invent achievements." disabled={state.status !== "active"} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void submit()} loading={busy} disabled={!answerText.trim() || state.status !== "active"}>Submit answer</Button>
                  {state.status === "active" && <Button variant="outline" onClick={() => void pause()} disabled={busy}>Pause</Button>}
                  {state.status === "paused" && <Button variant="outline" onClick={() => void resume()} disabled={busy}>Resume</Button>}
                  <Button variant="outline" onClick={() => void complete()} disabled={busy}>Complete & generate report</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-400">No active question. {state.status === "completed" ? "Session completed." : "Start a new session or load one from History."}</p>
            )}
          </CardContent></Card>

          <Card><CardHeader><h2 className="font-medium">Feedback & follow-up</h2></CardHeader><CardContent className="pt-2 space-y-3 text-sm">
            {!result && !report && <p className="text-zinc-500">Submit an answer to see evaluation, communication feedback, and follow-up suggestions.</p>}
            {result?.evaluation && (
              <div className="space-y-2">
                <div className="text-zinc-200">Overall score: <span className="font-semibold">{result.evaluation.overallScore}</span>/100</div>
                {result.communicationFeedback?.overallRating && <div className="text-zinc-400">Communication: <span className="text-zinc-200">{result.communicationFeedback.overallRating}</span></div>}
                {Array.isArray(result.evaluation.strengths) && result.evaluation.strengths.length > 0 && <div><div className="text-zinc-400">Strengths</div><ul className="list-disc pl-5 text-zinc-300">{result.evaluation.strengths.slice(0,4).map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
                {Array.isArray(result.evaluation.gaps) && result.evaluation.gaps.length > 0 && <div><div className="text-zinc-400">Gaps / opportunities</div><ul className="list-disc pl-5 text-zinc-300">{result.evaluation.gaps.slice(0,4).map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
                {Array.isArray(result.followUps) && result.followUps.length > 0 && <div><div className="text-zinc-400">Suggested follow-ups</div><ul className="list-disc pl-5 text-zinc-300">{result.followUps.slice(0,3).map((f:any,i:number)=><li key={i}>{f.questionText ?? String(f)}</li>)}</ul></div>}
                {evidenceNote.length > 0 && <p className="text-xs text-amber-300">Grounding note: add specific evidence/metrics for identified gaps; guidance is based on submitted text, not invented experience.</p>}
              </div>
            )}
            {report && (
              <div className="space-y-2 border-t border-border pt-3">
                <div className="font-medium text-zinc-200">Session report</div>
                <div>Overall: {report.overallScore}/100</div>
                <p className="text-zinc-400">{report.overallAssessment}</p>
                {Array.isArray(report.recommendedLearningAreas) && report.recommendedLearningAreas.length > 0 && <div><div className="text-zinc-400">Recommended focus</div><ul className="list-disc pl-5 text-zinc-300">{report.recommendedLearningAreas.slice(0,4).map((s:string,i:number)=><li key={i}>{s}</li>)}</ul></div>}
              </div>
            )}
          </CardContent></Card>
        </div>
      )}
    </PageContainer>
  );
}

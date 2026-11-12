import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function LiveInterview() {
  const [params] = useSearchParams();
  const sessionIdParam = params.get("sessionId") ?? "";
  const [sessionId, setSessionId] = useState(sessionIdParam);
  const [runtimeState, setRuntimeState] = useState<any>();
  const [input, setInput] = useState("");
  const [last, setLast] = useState<any>();
  const [audioStatus, setAudioStatus] = useState<string>("Not started (user action required)");
  const [captureStatus, setCaptureStatus] = useState<string>("Not started (user action required)");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const runtime = (window as any).veyra?.runtime;
  const audio = (window as any).veyra?.audio;
  const captureApi = (window as any).veyra?.capture;

  const refresh = async (id: string) => {
    if (!runtime || !id) return;
    const st = await runtime.getState({ sessionId: id });
    if (st?.success) setRuntimeState(st.data);
  };

  useEffect(() => { if (sessionId) void refresh(sessionId).catch(()=>{}); /* eslint-disable-next-line */ }, [sessionId]);

  const createLive = async () => {
    setBusy(true); setError(undefined);
    try {
      if (!runtime) throw new Error("Runtime API unavailable.");
      const created = await runtime.createSession({ mode: "live", targetRole: "Interview Candidate", interviewType: "mixed", domain: "general_employment" });
      if (!created?.success || !created?.data?.sessionId) throw new Error(created?.error?.message ?? "Failed to create live session.");
      await runtime.startSession({ sessionId: created.data.sessionId });
      setSessionId(created.data.sessionId);
      await refresh(created.data.sessionId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to create live session."); }
    finally { setBusy(false); }
  };

  const submitQuestion = async (source: "typed" | "voice_transcript" | "screen_context") => {
    if (!sessionId || !input.trim()) return;
    setBusy(true); setError(undefined);
    try {
      const res = await runtime.processQuestion({ sessionId, text: input, source, generateAI: false });
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to process question.");
      setLast(res.data);
      setInput("");
      await refresh(sessionId);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to process question."); }
    finally { setBusy(false); }
  };

  const pause = async () => { if (!sessionId) return; await runtime.pauseSession({ sessionId }); await refresh(sessionId); };
  const resume = async () => { if (!sessionId) return; await runtime.resumeSession({ sessionId }); await refresh(sessionId); };
  const stop = async () => { if (!sessionId) return; await runtime.completeSession({ sessionId }); await refresh(sessionId); };

  const startAudio = async () => {
    if (!sessionId) { setAudioStatus("Create/start a live session first."); return; }
    if (!audio?.startSession) { setAudioStatus("Audio IPC unavailable."); return; }
    try {
      const res = await audio.startSession({ sessionId });
      if (res?.success) setAudioStatus(`Capture session started (${res.data?.sessionId ?? sessionId}). Real transcription/hardware availability depends on environment; no raw audio is exposed to renderer.`);
      else setAudioStatus(res?.error?.message ?? "Audio capture could not be started.");
    } catch (e) { setAudioStatus(e instanceof Error ? e.message : "Audio capture failed."); }
  };
  const stopAudio = async () => { if (!audio?.stopSession || !sessionId) return; try { await audio.stopSession({ sessionId }); setAudioStatus("Capture stopped."); } catch { setAudioStatus("Stop requested (status unknown)."); } };

  const checkCapture = async () => {
    if (!captureApi?.listSources) { setCaptureStatus("Capture IPC unavailable."); return; }
    try {
      const res = await captureApi.listSources({});
      if (res?.success) setCaptureStatus(`Sources enumerated: ${(res.data?.sources ?? []).length}. Screen capture is user-initiated and vision inference may be unavailable without an authorized pipeline.`);
      else setCaptureStatus(res?.error?.message ?? "Capture sources unavailable.");
    } catch (e) { setCaptureStatus(e instanceof Error ? e.message : "Capture unavailable."); }
  };

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Live Interview Workspace</h1>
          <p className="mt-2 text-sm text-zinc-500">Foundation for live assistance using the unified runtime. Audio/screen capture are explicit, user-controlled actions; unavailable hardware/providers are reported honestly (no fake transcripts or hidden capture).</p>
        </div>
        <div className="flex gap-2"><Link to="/interview/setup"><Button variant="outline">Setup</Button></Link><Button onClick={()=>void createLive()} loading={busy && !sessionId}>New live session</Button></div>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2"><CardHeader><h2 className="font-medium">Session & transcript/question input</h2></CardHeader><CardContent className="pt-2 space-y-4">
          <div className="text-sm text-zinc-400">Session: <span className="text-zinc-200">{sessionId || "none"}</span> · Status: <span className="text-zinc-200">{runtimeState?.status ?? "—"}</span> · Mode: {runtimeState?.mode ?? "live"}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={()=>void startAudio()} disabled={!sessionId}>Start microphone capture</Button>
            <Button variant="outline" onClick={()=>void stopAudio()} disabled={!sessionId}>Stop microphone</Button>
            <Button variant="outline" onClick={()=>void checkCapture()} disabled={!sessionId}>List capture sources</Button>
            <Button variant="outline" onClick={()=>void pause()} disabled={!sessionId}>Pause</Button>
            <Button variant="outline" onClick={()=>void resume()} disabled={!sessionId}>Resume</Button>
            <Button variant="outline" onClick={()=>void stop()} disabled={!sessionId}>Stop session</Button>
          </div>
          <div className="grid gap-2 text-xs text-zinc-500">
            <div><span className="text-zinc-400">Audio:</span> {audioStatus}</div>
            <div><span className="text-zinc-400">Capture/vision:</span> {captureStatus}</div>
          </div>
          <label className="block text-sm text-zinc-400">Detected/question text (typed or injected transcript text)
            <textarea className="mt-2 min-h-28 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={input} onChange={e=>setInput(e.target.value)} placeholder="Paste/type an interviewer question or transcript segment. Voice-to-text pipeline integration is environment-dependent." />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={()=>void submitQuestion("typed")} disabled={!sessionId || !input.trim() || busy}>Analyze typed question</Button>
            <Button variant="outline" onClick={()=>void submitQuestion("voice_transcript")} disabled={!sessionId || !input.trim() || busy}>Analyze as transcript</Button>
          </div>
        </CardContent></Card>

        <Card><CardHeader><h2 className="font-medium">Guidance (grounded)</h2></CardHeader><CardContent className="pt-2 space-y-3 text-sm">
          {!last && <p className="text-zinc-500">Process a question to see understanding, domain, suggested talking points, evidence/provenance, and follow-up awareness. No candidate facts are fabricated.</p>}
          {last && (
            <>
              <div><div className="text-zinc-400">Question</div><div className="text-zinc-200">{last.questionText}</div></div>
              <div><div className="text-zinc-400">Domain / intent</div><div className="text-zinc-200">{last.domain?.primaryDomain ?? "—"} · {last.understanding?.coreIntent ?? "—"}</div></div>
              {Array.isArray(last.guidance?.talkingPoints) && last.guidance.talkingPoints.length > 0 && <div><div className="text-zinc-400">Key talking points</div><ul className="list-disc pl-5 text-zinc-300">{last.guidance.talkingPoints.slice(0,6).map((t:string,i:number)=><li key={i}>{t}</li>)}</ul></div>}
              {Array.isArray(last.guidance?.structure) && last.guidance.structure.length > 0 && <div><div className="text-zinc-400">Suggested structure</div><div className="text-zinc-300">{last.guidance.structure.join(" → ")}</div></div>}
              <div><div className="text-zinc-400">Evidence/provenance</div><div className="text-zinc-300">Grounded: {String(last.provenance?.factsGrounded)} · candidate evidence: {(last.provenance?.candidateEvidenceIds??[]).length} · memory: {(last.provenance?.memoryIds??[]).length}</div></div>
              {Array.isArray(last.provenance?.assumptions) && last.provenance.assumptions.length > 0 && <div className="text-amber-300 text-xs">Assumptions: {last.provenance.assumptions.join(" ")}</div>}
              {Array.isArray(last.followUps) && last.followUps.length > 0 && <div><div className="text-zinc-400">Possible follow-ups</div><ul className="list-disc pl-5 text-zinc-300">{last.followUps.slice(0,3).map((f:any,i:number)=><li key={i}>{f.questionText ?? String(f)}</li>)}</ul></div>}
              {last.ai?.executed === false && last.ai?.unavailableReason && <div className="text-xs text-zinc-500">AI generation: unavailable ({last.ai.unavailableReason})</div>}
            </>
          )}
        </CardContent></Card>
      </div>
    </PageContainer>
  );
}

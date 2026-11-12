import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function InterviewSetup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"practice" | "live">((params.get("mode") as any) === "live" ? "live" : "practice");
  const [targetRole, setTargetRole] = useState("");
  const [domain, setDomain] = useState("general_employment");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<string>();

  const runtime = (window as any).veyra?.runtime;
  const audio = (window as any).veyra?.audio;
  const capture = (window as any).veyra?.capture;

  const checks = useMemo(() => ([
    { name: "Unified runtime", ok: Boolean(runtime), detail: runtime ? "Available via preload IPC." : "Unavailable." },
    { name: "Audio capture IPC", ok: Boolean(audio), detail: audio ? "Device/permission/session APIs exposed; real microphone capture depends on renderer/device support and is user-initiated." : "Unavailable." },
    { name: "Screen capture IPC", ok: Boolean(capture), detail: capture ? "Source listing/session APIs exposed; real capture/vision inference not guaranteed in this environment." : "Unavailable." },
  ]), [runtime, audio, capture]);

  const start = async () => {
    setBusy(true); setError(undefined); setInfo(undefined);
    try {
      if (!runtime) throw new Error("Runtime API unavailable.");
      const created = await runtime.createSession({ mode, targetRole: targetRole.trim() || undefined, domain, interviewType: "mixed", questionCount: 5 });
      if (!created?.success || !created?.data?.sessionId) throw new Error(created?.error?.message ?? "Failed to create session.");
      await runtime.startSession({ sessionId: created.data.sessionId });
      setInfo(`Started ${mode} session ${created.data.sessionId}.`);
      navigate(mode === "live" ? `/live?sessionId=${encodeURIComponent(created.data.sessionId)}` : `/practice?sessionId=${encodeURIComponent(created.data.sessionId)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to start session."); }
    finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Interview Setup</h1>
      <p className="mt-2 text-sm text-zinc-500">User-controlled setup for practice or live assistance. Capture/transcription/vision features are only activated through explicit actions and may be unavailable without supported hardware or authorized providers.</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {info && <p role="status" className="mt-4 text-sm text-emerald-400">{info}</p>}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><h2 className="font-medium">Session configuration</h2></CardHeader><CardContent className="pt-2 grid gap-4">
          <label className="text-sm text-zinc-400">Mode
            <select className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={mode} onChange={e=>setMode(e.target.value as any)}>
              <option value="practice">Practice (typed, evaluated)</option>
              <option value="live">Live workspace (assistance)</option>
            </select>
          </label>
          <label className="text-sm text-zinc-400">Target role
            <input className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={targetRole} onChange={e=>setTargetRole(e.target.value)} placeholder="Role/company context" />
          </label>
          <label className="text-sm text-zinc-400">Domain
            <input className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={domain} onChange={e=>setDomain(e.target.value)} placeholder="e.g. healthcare, software_engineering, finance" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={()=>void start()} loading={busy}>Create & start</Button>
            <Link to="/preparation"><Button variant="outline">Detailed preparation</Button></Link>
          </div>
        </CardContent></Card>

        <Card><CardHeader><h2 className="font-medium">Device & permission readiness</h2></CardHeader><CardContent className="pt-2 space-y-3 text-sm">
          {checks.map(c => (
            <div key={c.name} className="rounded-lg border border-border bg-black/20 p-3">
              <div className="flex items-center justify-between"><span className="text-zinc-200">{c.name}</span><span className={c.ok?"text-emerald-400":"text-amber-400"}>{c.ok?"Available":"Unavailable"}</span></div>
              <p className="mt-1 text-zinc-500">{c.detail}</p>
            </div>
          ))}
          <p className="text-xs text-zinc-500">No microphone or screen capture starts automatically. Hardware transcription/vision pipelines are environment-dependent and reported honestly when unavailable.</p>
        </CardContent></Card>
      </div>
    </PageContainer>
  );
}

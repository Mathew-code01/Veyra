import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const DOMAINS = [
  "software_engineering","data_science","cybersecurity","business_management","finance",
  "healthcare","education","human_resources","customer_support","sales","marketing",
  "legal","operations","leadership","general_employment"
];

export function Preparation() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"practice" | "live">("practice");
  const [targetRole, setTargetRole] = useState("");
  const [domain, setDomain] = useState("general_employment");
  const [questionCount, setQuestionCount] = useState(5);
  const [jobDescription, setJobDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const start = async () => {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const rt = (window as any).veyra?.runtime;
      if (!rt) throw new Error("Unified runtime API is not available in this build.");
      const created = await rt.createSession({
        mode,
        targetRole: targetRole.trim() || undefined,
        domain,
        questionCount,
        jobDescription: jobDescription.trim() || undefined,
        interviewType: "mixed",
      });
      if (!created?.success || !created?.data?.sessionId) {
        throw new Error(created?.error?.message ?? "Failed to create session.");
      }
      const started = await rt.startSession({ sessionId: created.data.sessionId });
      if (!started?.success) throw new Error(started?.error?.message ?? "Failed to start session.");
      setMessage(`Session ${created.data.sessionId} started.`);
      navigate(mode === "live" ? `/live?sessionId=${encodeURIComponent(created.data.sessionId)}` : `/practice?sessionId=${encodeURIComponent(created.data.sessionId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start interview session.");
    } finally { setBusy(false); }
  };

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold">Interview Preparation & Setup</h1>
      <p className="mt-2 text-sm text-zinc-500">Configure and start a practice or live session using the unified interview runtime (real IPC/main-process orchestration).</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-400">{message}</p>}
      <Card className="mt-6"><CardHeader><h2 className="font-medium">Session setup</h2></CardHeader><CardContent className="grid gap-4 pt-2 sm:grid-cols-2">
        <label className="text-sm text-zinc-400">Mode
          <select className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={mode} onChange={e=>setMode(e.target.value as any)}>
            <option value="practice">Practice</option>
            <option value="live">Live (assistance workspace)</option>
          </select>
        </label>
        <label className="text-sm text-zinc-400">Target role
          <input className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={targetRole} onChange={e=>setTargetRole(e.target.value)} placeholder="e.g. Nurse, Software Engineer, Product Manager" />
        </label>
        <label className="text-sm text-zinc-400">Professional domain
          <select className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={domain} onChange={e=>setDomain(e.target.value)}>
            {DOMAINS.map(d=><option key={d} value={d}>{d.replace(/_/g," ")}</option>)}
          </select>
        </label>
        <label className="text-sm text-zinc-400">Question count (practice)
          <input type="number" min={1} max={20} className="mt-1 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={questionCount} onChange={e=>setQuestionCount(Number(e.target.value||5))} />
        </label>
        <label className="text-sm text-zinc-400 sm:col-span-2">Job description / context (optional)
          <textarea className="mt-1 min-h-28 w-full rounded-lg border border-border bg-black/20 px-3 py-2 text-white" value={jobDescription} onChange={e=>setJobDescription(e.target.value)} placeholder="Paste target job description or interview context (stays local unless explicitly authorized elsewhere)." />
        </label>
        <div className="sm:col-span-2 flex flex-wrap gap-3">
          <Button onClick={()=>void start()} loading={busy}>Start session</Button>
          <p className="text-xs text-zinc-500 self-center">Live audio/screen capture remain user-initiated and may be unavailable in this environment; no fake capture/transcription is shown.</p>
        </div>
      </CardContent></Card>
    </PageContainer>
  );
}

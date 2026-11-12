import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function History() {
  const [sessions, setSessions] = useState<readonly any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const api = (window as any).veyra?.practice;

  const load = async () => {
    setLoading(true); setError(undefined);
    try {
      if (!api?.listSessions) throw new Error("Practice/session listing API unavailable.");
      const res = await api.listSessions({});
      if (!res?.success) throw new Error(res?.error?.message ?? "Failed to list sessions.");
      setSessions(res.data ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load history."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, []);

  return (
    <PageContainer>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Interview History</h1>
          <p className="mt-2 text-sm text-zinc-500">Persisted practice sessions for the active profile (SQLite-backed). Open a session to review progress and reports where available.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} loading={loading}>Refresh</Button>
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-red-400">{error}</p>}
      <Card className="mt-6"><CardContent className="pt-5">
        {loading ? <p className="text-sm text-zinc-400">Loading sessions…</p> : sessions.length === 0 ? (
          <p className="text-sm text-zinc-400">No sessions found. Start one from <Link className="text-primary" to="/interview/setup">Interview Setup</Link>.</p>
        ) : (
          <ul className="divide-y divide-white/8">
            {sessions.map((s: any) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100 truncate">{s.title ?? s.targetRole ?? s.id}</p>
                  <p className="mt-1 text-xs text-zinc-500">{s.id} · {s.status} · {s.questionsAnswered ?? 0}/{s.questionCount ?? "?"} answered · role: {s.targetRole ?? "—"} · domain: {s.domain ?? "—"}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/practice?sessionId=${encodeURIComponent(s.id)}`}><Button size="sm" variant="outline">Open practice</Button></Link>
                  <Link to={`/history/${encodeURIComponent(s.id)}`}><Button size="sm">Details</Button></Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>
    </PageContainer>
  );
}

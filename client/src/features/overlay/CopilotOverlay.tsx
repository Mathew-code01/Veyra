import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";

interface RuntimeGuidance {
  readonly questionText?: string;
  readonly domain?: { readonly primaryDomain?: string };
  readonly understanding?: { readonly coreIntent?: string };
  readonly guidance?: {
    readonly headline?: string;
    readonly talkingPoints?: readonly string[];
    readonly structure?: readonly string[];
    readonly cautions?: readonly string[];
  };
  readonly evidence?: readonly {
    readonly id: string;
    readonly source: string;
    readonly text: string;
    readonly verified?: boolean;
  }[];
  readonly provenance?: {
    readonly factsGrounded?: boolean;
    readonly assumptions?: readonly string[];
  };
  readonly followUps?: readonly {
    readonly questionText?: string;
    readonly text?: string;
  }[];
}

interface RuntimeState {
  readonly status?: string;
  readonly lastGuidance?: RuntimeGuidance;
}

function getSessionIdFromLocation(): string | undefined {
  const hashQuery = window.location.hash.includes("?")
    ? window.location.hash.slice(window.location.hash.indexOf("?") + 1)
    : "";
  const params = new URLSearchParams(hashQuery || window.location.search);
  return params.get("sessionId")?.trim() || undefined;
}

export function CopilotOverlay() {
  const [sessionId, setSessionId] = useState<string>();
  const [sessionStatus, setSessionStatus] = useState("starting");
  const [question, setQuestion] = useState("");
  const [guidance, setGuidance] = useState<RuntimeGuidance>();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(true);
  const [opacity, setOpacity] = useState(0.9);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const loadSession = useCallback(async (activeSessionId: string) => {
    if (!window.veyra?.runtime?.getState) {
      throw new Error("VEYRA Desktop runtime is unavailable.");
    }
    const result = await window.veyra.runtime.getState({
      sessionId: activeSessionId,
    });
    if (!result.success || !result.data) {
      throw new Error(result.error?.message ?? "Could not load interview session.");
    }

    const state = result.data as RuntimeState;
    setSessionStatus(state.status ?? "unknown");
    setGuidance(state.lastGuidance);
  }, []);

  useEffect(() => {
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousRootBackground = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";

    let active = true;
    const initialize = async () => {
      try {
        if (!window.veyra?.runtime?.createSession) {
          setError("VEYRA Desktop runtime is required for the overlay.");
          setSessionStatus("unavailable");
          return;
        }
        const existingSessionId = getSessionIdFromLocation();
        if (existingSessionId) {
          await loadSession(existingSessionId);
          if (active) {
            setSessionId(existingSessionId);
          }
          return;
        }

        const created = await window.veyra.runtime.createSession({
          mode: "live",
          targetRole: "Interview",
          domain: "general_employment",
          title: "Live interview",
        });
        const newSessionId = created.data?.sessionId;
        if (!created.success || typeof newSessionId !== "string") {
          throw new Error(created.error?.message ?? "Could not start a live session.");
        }

        const started = await window.veyra.runtime.startSession({
          sessionId: newSessionId,
        });
        if (!started.success) {
          throw new Error(started.error?.message ?? "Could not activate the live session.");
        }
        if (active) {
          setSessionId(newSessionId);
          setSessionStatus(started.data?.status ?? "active");
        }
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Could not start Veyra.");
          setSessionStatus("unavailable");
        }
      }
    };

    void initialize();
    return () => {
      active = false;
      requestId.current += 1;
      document.body.style.backgroundColor = previousBodyBackground;
      document.documentElement.style.backgroundColor = previousRootBackground;
    };
  }, [loadSession]);

  const processQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = question.trim();
    if (!sessionId || !text || busy) {
      return;
    }

    const currentRequestId = ++requestId.current;
    setBusy(true);
    setError(undefined);
    setGuidance(undefined);

    try {
      const result = await window.veyra.runtime.processQuestion({
        sessionId,
        text,
        source: "typed",
        generateAI: false,
      });
      if (!result.success || !result.data) {
        throw new Error(result.error?.message ?? "Question analysis failed.");
      }
      if (requestId.current === currentRequestId) {
        setGuidance(result.data as RuntimeGuidance);
        setQuestion("");
      }
    } catch (cause) {
      if (requestId.current === currentRequestId) {
        setError(cause instanceof Error ? cause.message : "Question analysis failed.");
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setBusy(false);
      }
    }
  };

  const toggleSession = async () => {
    if (!sessionId) {
      return;
    }
    try {
      const operation =
        sessionStatus === "paused"
          ? window.veyra.runtime.resumeSession
          : window.veyra.runtime.pauseSession;
      const result = await operation({ sessionId });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not update session.");
      }
      setSessionStatus(result.data?.status ?? (sessionStatus === "paused" ? "active" : "paused"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update session.");
    }
  };

  const stopSession = async () => {
    if (!sessionId) {
      await window.veyra.overlay.hide();
      return;
    }
    try {
      const result = await window.veyra.runtime.completeSession({ sessionId });
      if (!result.success) {
        throw new Error(result.error?.message ?? "Could not stop the session.");
      }
      setSessionStatus("completed");
      await window.veyra.overlay.hide();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not stop the session.");
    }
  };

  const updateOpacity = async (value: number) => {
    setOpacity(value);
    const result = await window.veyra.overlay.setOpacity(value);
    if (!result.success) {
      setError(result.error?.message ?? "Could not change overlay opacity.");
    }
  };

  const togglePin = async () => {
    const next = !pinned;
    const result = await window.veyra.overlay.setAlwaysOnTop(next);
    if (!result.success) {
      setError(result.error?.message ?? "Could not update overlay pin state.");
      return;
    }
    setPinned(next);
  };

  return (
    <main
      className="h-screen overflow-hidden rounded-[22px] border border-white/15 bg-slate-950/90 p-4 text-slate-100 shadow-[0_28px_100px_rgba(7,10,25,0.52)] backdrop-blur-2xl"
      style={{ backgroundColor: "rgba(13, 17, 34, 0.90)" }}
    >
      <header
        className="flex items-center justify-between gap-2"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold">Veyra · Live Copilot</div>
          <div className="truncate text-[11px] text-zinc-400">
            <span className={`inline-flex items-center gap-2 font-medium capitalize ${sessionStatus === "active" ? "text-emerald-300" : sessionStatus === "paused" ? "text-amber-300" : "text-slate-300"}`}><span className={`h-2 w-2 rounded-full ${sessionStatus === "active" ? "bg-emerald-400" : sessionStatus === "paused" ? "bg-amber-400" : "bg-slate-500"}`} />{sessionStatus}</span><span className="ml-2 text-slate-400">Typed input ready · microphone off · screen context off</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-1" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
            aria-label={expanded ? "Compact overlay" : "Expand overlay"}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Compact" : "Expand"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
            aria-label={pinned ? "Unpin overlay" : "Pin overlay"}
            onClick={() => void togglePin()}
          >
            {pinned ? "Pinned" : "Unpinned"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10"
            aria-label="Hide overlay"
            onClick={() => void window.veyra.overlay.hide()}
          >
            Hide
          </button>
        </div>
      </header>

      <section className={`mt-4 space-y-3 overflow-y-auto ${expanded ? "max-h-[calc(100vh-7rem)]" : "max-h-[230px]"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[11px] text-slate-300">
          <label className="flex items-center gap-2">
            Opacity
            <input
              aria-label="Overlay opacity"
              type="range"
              min="0.35"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(event) => void updateOpacity(Number(event.currentTarget.value))}
            />
          </label>
          <span>Live transcription is not connected · type a question</span>
        </div>

        <form onSubmit={(event) => void processQuestion(event)} className="space-y-2">
          <label htmlFor="overlay-question" className="sr-only">
            Interview question
          </label>
          <textarea
            id="overlay-question"
            className="min-h-20 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-violet-300/70 focus:ring-2 focus:ring-violet-300/15"
            value={question}
            onChange={(event) => setQuestion(event.currentTarget.value)}
            placeholder="Type or paste the interview question…"
            maxLength={4000}
            disabled={busy || sessionStatus !== "active"}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">
              Candidate evidence is shown with provenance; no facts are invented.
            </span>
            <button
              type="submit"
              disabled={!sessionId || busy || !question.trim() || sessionStatus !== "active"}
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3.5 py-2 text-xs font-semibold text-white shadow-lg shadow-violet-950/30 transition hover:from-indigo-400 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? "Analyzing…" : "Ask Veyra"}
            </button>
          </div>
        </form>

        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}

        {guidance && (
          <article aria-live="polite" className="space-y-3 rounded-xl border border-white/10 bg-white/[0.035] p-3.5 text-xs">
            <div className="font-medium text-zinc-100">{guidance.questionText}</div>
            <div className="text-zinc-400">
              {guidance.domain?.primaryDomain ?? "General"} · {guidance.understanding?.coreIntent ?? "Question intent"}
            </div>
            {guidance.guidance?.headline && (
              <p className="text-zinc-200">{guidance.guidance.headline}</p>
            )}
            {guidance.guidance?.structure && guidance.guidance.structure.length > 0 && (
              <p className="text-zinc-300">
                Structure: {guidance.guidance.structure.join(" → ")}
              </p>
            )}
            {guidance.guidance?.talkingPoints && guidance.guidance.talkingPoints.length > 0 && (
              <ul className="list-disc space-y-1 pl-4 text-zinc-300">
                {guidance.guidance.talkingPoints.slice(0, 5).map((point, index) => (
                  <li key={`${index}-${point}`}>{point}</li>
                ))}
              </ul>
            )}
            {guidance.evidence && guidance.evidence.length > 0 && (
              <div>
                <div className="text-zinc-400">Relevant evidence</div>
                <ul className="mt-1 space-y-1">
                  {guidance.evidence.slice(0, expanded ? 6 : 2).map((item) => (
                    <li key={item.id} className="text-zinc-300">
                      <span className="text-emerald-300">{item.source}{item.verified ? " · verified" : ""}:</span>{" "}
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {guidance.provenance?.assumptions?.map((assumption) => (
              <p key={assumption} className="text-amber-300">{assumption}</p>
            ))}
            {guidance.guidance?.cautions?.slice(0, 2).map((caution) => (
              <p key={caution} className="text-amber-200">Consider: {caution}</p>
            ))}
            {guidance.followUps && guidance.followUps.length > 0 && (
              <p className="text-zinc-400">
                Possible follow-up: {guidance.followUps[0].questionText ?? guidance.followUps[0].text}
              </p>
            )}
          </article>
        )}
      </section>

      <footer className="mt-3 flex justify-between border-t border-white/10 pt-3" style={{ WebkitAppRegion: "no-drag" } as CSSProperties}>
        <button type="button" className="text-xs font-medium text-slate-300 transition hover:text-white" onClick={() => void toggleSession()}>
          {sessionStatus === "paused" ? "Resume" : "Pause"}
        </button>
        <button type="button" className="text-xs font-medium text-rose-300 transition hover:text-rose-200" onClick={() => void stopSession()}>
          Stop session
        </button>
      </footer>
    </main>
  );
}
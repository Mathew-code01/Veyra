import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  AudioLines,
  ChevronDown,
  EyeOff,
  Maximize2,
  MicOff,
  Minus,
  Pause,
  Pin,
  Play,
  Send,
  Square,
  X,
} from "lucide-react";

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
  const [overlayWidth, setOverlayWidth] = useState(420);
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
      throw new Error(
        result.error?.message ?? "Could not load interview session.",
      );
    }

    const state = result.data as RuntimeState;
    setSessionStatus(state.status ?? "unknown");
    setGuidance(state.lastGuidance);
  }, []);

  useEffect(() => {
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousRootBackground =
      document.documentElement.style.backgroundColor;
    const previousBodyMinWidth = document.body.style.minWidth;
    const previousRootMinWidth = document.documentElement.style.minWidth;
    const root = document.getElementById("root");
    const previousAppMinWidth = root?.style.minWidth ?? "";
    document.body.style.backgroundColor = "transparent";
    document.documentElement.style.backgroundColor = "transparent";
    document.body.style.minWidth = "280px";
    document.documentElement.style.minWidth = "280px";
    if (root) root.style.minWidth = "280px";

    let active = true;
    const initialize = async () => {
      try {
        try {
          const layout = await window.veyra?.overlay?.getState();
          if (active && layout?.success && layout.data?.width) {
            setOverlayWidth(layout.data.width);
            setExpanded(layout.data.width >= 520);
          }
          if (active && layout?.success && layout.data) {
            setOpacity(layout.data.opacity);
            setPinned(layout.data.alwaysOnTop);
          }
        } catch {
          // Window preferences are optional; session initialization remains authoritative.
        }
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
          throw new Error(
            created.error?.message ?? "Could not start a live session.",
          );
        }

        const started = await window.veyra.runtime.startSession({
          sessionId: newSessionId,
        });
        if (!started.success) {
          throw new Error(
            started.error?.message ?? "Could not activate the live session.",
          );
        }
        if (active) {
          setSessionId(newSessionId);
          setSessionStatus(started.data?.status ?? "active");
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Could not start Veyra.",
          );
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
      document.body.style.minWidth = previousBodyMinWidth;
      document.documentElement.style.minWidth = previousRootMinWidth;
      if (root) root.style.minWidth = previousAppMinWidth;
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
        setError(
          cause instanceof Error ? cause.message : "Question analysis failed.",
        );
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
      setSessionStatus(
        result.data?.status ??
          (sessionStatus === "paused" ? "active" : "paused"),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update session.",
      );
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
      setError(
        cause instanceof Error ? cause.message : "Could not stop the session.",
      );
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

  const resizeOverlay = async (width: number, height?: number) => {
    try {
      let targetHeight = height;
      if (targetHeight === undefined) {
        const current = await window.veyra.overlay.getState();
        targetHeight = current.data?.height ?? 360;
      }
      const result = await window.veyra.overlay.setSize(width, targetHeight);
      if (!result.success) {
        setError(result.error?.message ?? "Could not resize the overlay.");
        return;
      }
      setOverlayWidth(width);
      setExpanded(width >= 520);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not resize the overlay.",
      );
    }
  };

  const toggleExpanded = async () => {
    await resizeOverlay(expanded ? 380 : 520, expanded ? 360 : 520);
  };

  return (
    <main
      className="flex h-screen min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/80 p-3 text-[#0F1B3D] shadow-[0_12px_40px_rgba(15,27,61,0.20)] backdrop-blur-[24px] sm:p-3"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.80)" }}
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-[#E4E7F0] pb-2.5"
        style={{ WebkitAppRegion: "drag" } as CSSProperties}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <img src="/veyra-mark.svg" alt="" className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold tracking-[0.01em]">
              VEYRA
            </div>
            <div className="truncate text-[10px] text-[#6B7694]">
              Live Copilot · {sessionStatus}
            </div>
          </div>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
        >
          <span
            className="inline-flex h-6 items-center gap-1 rounded-full border border-[#E4E7F0] bg-white/80 px-2 text-[10px] font-medium text-[#6B7694]"
            aria-label="Microphone off"
          >
            <MicOff className="h-3 w-3" />
            Mic off
          </span>
          <span
            className="hidden h-6 items-center gap-1 rounded-full border border-[#E4E7F0] bg-white/80 px-2 text-[10px] font-medium text-[#6B7694] min-[380px]:inline-flex"
            aria-label="Screen capture off"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#6B7694]" />
            Screen off
          </span>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-[#E4E7F0] bg-white/80 text-[#3B4766] transition hover:bg-[#F5F2FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0]"
            aria-label={expanded ? "Compact overlay" : "Expand overlay"}
            title={expanded ? "Compact overlay" : "Expand overlay"}
            onClick={() => void toggleExpanded()}
          >
            {expanded ? (
              <Minus className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            className={`grid h-7 w-7 place-items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] ${pinned ? "border-[#D6CBFF] bg-[#F5F2FF] text-[#5638C4]" : "border-[#E4E7F0] bg-white/80 text-[#3B4766] hover:bg-[#F5F2FF]"}`}
            aria-label={pinned ? "Unpin overlay" : "Pin overlay"}
            title={pinned ? "Unpin overlay" : "Pin overlay"}
            onClick={() => void togglePin()}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="grid h-7 w-7 place-items-center rounded-full border border-[#E4E7F0] bg-white/80 text-[#3B4766] transition hover:bg-[#F5F2FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0]"
            aria-label="Hide overlay"
            title="Hide overlay"
            onClick={() => void window.veyra.overlay.hide()}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <section
        className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-1"
        aria-live="polite"
      >
        <div className="flex shrink-0 items-start gap-2 rounded-xl border border-[#D6CBFF] bg-[#F5F2FF]/90 px-3 py-2.5">
          <AudioLines className="mt-0.5 h-4 w-4 shrink-0 text-[#5638C4]" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0F1B3D]">
              Type a question when you need help
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-[#3B4766]">
              Microphone and screen capture are off in this overlay. Live
              transcription is not connected.
            </p>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="shrink-0 rounded-lg border border-[#F2C8C8] bg-[#FDECEC] px-3 py-2 text-xs text-[#8E2929]"
          >
            {error}
          </p>
        )}

        {guidance && (
          <article
            aria-live="polite"
            className="shrink-0 space-y-2 rounded-xl border border-[#E4E7F0] bg-white/85 p-3 text-xs text-[#3B4766]"
          >
            <div className="text-sm font-semibold text-[#0F1B3D]">
              {guidance.questionText}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#6B7694]">
              <span>
                {guidance.domain?.primaryDomain ?? "General"} ·{" "}
                {guidance.understanding?.coreIntent ?? "Question intent"}
              </span>
              {guidance.provenance?.factsGrounded && (
                <span className="rounded-full border border-[#B9E4D0] bg-[#E6F5EE] px-2 py-0.5 font-medium text-[#1F8A5B]">
                  Grounded in your context
                </span>
              )}
            </div>
            {guidance.guidance?.headline && (
              <p className="font-medium text-[#0F1B3D]">
                {guidance.guidance.headline}
              </p>
            )}
            {guidance.guidance?.structure &&
              guidance.guidance.structure.length > 0 && (
                <p>Structure: {guidance.guidance.structure.join(" → ")}</p>
              )}
            {guidance.guidance?.talkingPoints &&
              guidance.guidance.talkingPoints.length > 0 && (
                <ul className="list-disc space-y-1 pl-4">
                  {guidance.guidance.talkingPoints
                    .slice(0, expanded ? 6 : 3)
                    .map((point, index) => (
                      <li key={`${index}-${point}`}>{point}</li>
                    ))}
                </ul>
              )}
            {guidance.evidence && guidance.evidence.length > 0 && (
              <div className="border-t border-[#E4E7F0] pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6B7694]">
                  Candidate evidence
                </p>
                <ul className="mt-1 space-y-1">
                  {guidance.evidence.slice(0, expanded ? 6 : 2).map((item) => (
                    <li key={item.id} className="leading-4">
                      <span
                        className={
                          item.verified
                            ? "font-medium text-[#1F8A5B]"
                            : "font-medium text-[#5638C4]"
                        }
                      >
                        {item.source}
                        {item.verified ? " · confirmed" : " · suggested"}:
                      </span>{" "}
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {guidance.provenance?.assumptions?.map((assumption) => (
              <p
                key={assumption}
                className="rounded-lg border border-[#F0D89E] bg-[#FFF4DC] px-2.5 py-2 text-[#805100]"
              >
                Review: {assumption}
              </p>
            ))}
            {guidance.guidance?.cautions?.slice(0, 2).map((caution) => (
              <p
                key={caution}
                className="rounded-lg border border-[#F0D89E] bg-[#FFF4DC] px-2.5 py-2 text-[#805100]"
              >
                Consider: {caution}
              </p>
            ))}
            {guidance.followUps && guidance.followUps.length > 0 && (
              <div className="border-t border-[#E4E7F0] pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#6B7694]">
                  Possible follow-up
                </p>
                <p>
                  {guidance.followUps[0].questionText ??
                    guidance.followUps[0].text}
                </p>
              </div>
            )}
          </article>
        )}
      </section>

      <form
        onSubmit={(event) => void processQuestion(event)}
        className="shrink-0 border-t border-[#E4E7F0] pt-2"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <label htmlFor="overlay-question" className="sr-only">
          Interview question
        </label>
        <textarea
          id="overlay-question"
          className="min-h-[54px] max-h-[90px] w-full resize-none rounded-xl border border-[#E4E7F0] bg-white/85 px-3 py-2 text-xs leading-5 text-[#0F1B3D] outline-none transition placeholder:text-[#6B7694] focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15 disabled:bg-[#EEF0F6]"
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          placeholder="Type or paste an interview question…"
          maxLength={4000}
          disabled={busy || sessionStatus !== "active"}
        />
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <details className="group relative text-[10px] text-[#6B7694]">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-1.5 py-1 hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0]">
              <span>Overlay settings</span>
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            </summary>
            <div className="absolute bottom-full left-0 z-10 mb-2 w-56 rounded-xl border border-[#E4E7F0] bg-white/95 p-3 shadow-[0_12px_36px_rgba(15,26,61,0.16)] backdrop-blur-[24px]">
              <label className="flex items-center justify-between gap-3 text-[11px] font-medium text-[#3B4766]">
                Opacity{" "}
                <span className="tabular-nums">
                  {Math.round(opacity * 100)}%
                </span>
              </label>
              <input
                aria-label="Overlay opacity"
                className="mt-2 w-full accent-[#6B4FE0]"
                type="range"
                min="0.35"
                max="1"
                step="0.05"
                value={opacity}
                onChange={(event) =>
                  void updateOpacity(Number(event.currentTarget.value))
                }
              />
              <p className="mt-1 text-[10px] leading-4 text-[#6B7694]">
                Adjust the entire window transparency.
              </p>
              <div className="mt-3 border-t border-[#E4E7F0] pt-2.5">
                <p className="text-[11px] font-medium text-[#3B4766]">
                  Panel size
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {[300, 380, 520].map((width) => (
                    <button
                      key={width}
                      type="button"
                      aria-pressed={overlayWidth === width}
                      onClick={() => void resizeOverlay(width)}
                      className={`h-7 rounded-md border text-[10px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] ${overlayWidth === width ? "border-[#D6CBFF] bg-[#F5F2FF] text-[#5638C4]" : "border-[#E4E7F0] bg-white text-[#3B4766] hover:bg-[#F7F8FC]"}`}
                    >
                      {width}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>
          <button
            type="submit"
            disabled={
              !sessionId ||
              busy ||
              !question.trim() ||
              sessionStatus !== "active"
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#6B4FE0] px-3.5 text-xs font-semibold text-white transition hover:bg-[#5638C4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[#EEF0F6] disabled:text-[#6B7694]"
          >
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {busy ? "Analysing" : "Ask Veyra"}
          </button>
        </div>
      </form>

      <footer
        className="mt-1.5 flex shrink-0 items-center justify-between gap-2"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <p className="hidden max-w-[62%] truncate text-[9px] text-[#6B7694] min-[360px]:block">
          Your evidence stays labelled with its source.
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-[34px] items-center gap-1 rounded-full border border-[#E4E7F0] bg-white/75 px-2.5 text-[10px] font-medium text-[#3B4766] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] disabled:opacity-50"
            onClick={() => void toggleSession()}
            disabled={
              !sessionId ||
              sessionStatus === "completed" ||
              sessionStatus === "unavailable"
            }
          >
            {sessionStatus === "paused" ? (
              <Play className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
            {sessionStatus === "paused" ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="grid h-[34px] w-[34px] place-items-center rounded-full border border-[#E4E7F0] bg-white/75 text-[#C23B3B] transition hover:bg-[#FDECEC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C23B3B] disabled:opacity-50"
            onClick={() => void stopSession()}
            disabled={
              !sessionId ||
              sessionStatus === "completed" ||
              sessionStatus === "unavailable"
            }
            aria-label="Stop session"
            title="Stop session"
          >
            <Square className="h-3 w-3 fill-current" />
          </button>
          <button
            type="button"
            className="grid h-[34px] w-[34px] place-items-center rounded-full border border-[#E4E7F0] bg-white/75 text-[#3B4766] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0]"
            onClick={() => void window.veyra.overlay.hide()}
            aria-label="Hide overlay"
            title="Hide overlay"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
        </div>
      </footer>
    </main>
  );
}

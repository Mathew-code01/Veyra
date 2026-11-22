import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  History,
  MessageSquareText,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  INTERVIEW_DOMAINS,
  INTERVIEW_DOMAIN_LABELS,
} from "@shared/constants/interviewDomains";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type PracticeState = {
  readonly id: string;
  readonly status: string;
  readonly questionsAnswered: number;
  readonly questionCount: number;
  readonly targetRole?: string;
  readonly domain?: string;
  readonly currentQuestion?: {
    readonly id: string;
    readonly text: string;
    readonly sequenceNumber: number;
    readonly type: string;
    readonly isFollowUp: boolean;
  };
};

type PracticeResult = {
  readonly evaluation?: {
    readonly overallScore?: number;
    readonly strengths?: readonly string[];
    readonly gaps?: readonly string[];
    readonly missedOpportunities?: readonly string[];
  };
  readonly communicationFeedback?: { readonly overallRating?: string };
  readonly followUps?: readonly { readonly questionText?: string }[];
  readonly isSessionCompleted?: boolean;
};

type PracticeReport = {
  readonly overallScore?: number;
  readonly overallAssessment?: string;
  readonly recommendedLearningAreas?: readonly string[];
};

type RecentPractice = {
  readonly id: string;
  readonly title?: string | null;
  readonly targetRole?: string;
  readonly status?: string;
  readonly questionsAnswered?: number;
  readonly questionCount?: number;
  readonly domain?: string;
};

const INTERVIEW_TYPES = [
  {
    value: "behavioral",
    label: "Behavioural",
    detail: "Practice clear, evidence-led stories.",
  },
  {
    value: "technical",
    label: "Technical",
    detail: "Explain your professional reasoning.",
  },
  {
    value: "case",
    label: "Case study",
    detail: "Work through a structured problem.",
  },
  {
    value: "mixed",
    label: "Mixed",
    detail: "A varied interview question set.",
  },
] as const;

const DIFFICULTIES = [
  { value: "beginner", label: "Warm-up" },
  { value: "intermediate", label: "Standard" },
  { value: "advanced", label: "Challenging" },
] as const;

export function QuestionPractice() {
  const [params, setParams] = useSearchParams();
  const initialSessionId = params.get("sessionId") ?? "";
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [state, setState] = useState<PracticeState>();
  const [answerText, setAnswerText] = useState("");
  const [result, setResult] = useState<PracticeResult>();
  const [report, setReport] = useState<PracticeReport>();
  const [busy, setBusy] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(
    Boolean(initialSessionId),
  );
  const [error, setError] = useState<string>();
  const [statusMsg, setStatusMsg] = useState<string>();
  const [targetRole, setTargetRole] = useState("");
  const [domain, setDomain] =
    useState<(typeof INTERVIEW_DOMAINS)[number]>("general_employment");
  const [interviewType, setInterviewType] =
    useState<(typeof INTERVIEW_TYPES)[number]["value"]>("mixed");
  const [difficulty, setDifficulty] =
    useState<(typeof DIFFICULTIES)[number]["value"]>("intermediate");
  const [jobDescription, setJobDescription] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [recentSessions, setRecentSessions] = useState<
    readonly RecentPractice[]
  >([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string>();

  const api = window.veyra?.practice;
  const currentQuestion = state?.currentQuestion;
  const progress = state?.questionCount
    ? Math.min(
        100,
        Math.round((state.questionsAnswered / state.questionCount) * 100),
      )
    : 0;

  const refreshRecent = useCallback(async () => {
    if (!api?.listSessions) {
      setRecentLoading(false);
      return;
    }
    setRecentLoading(true);
    setRecentError(undefined);
    try {
      const response = await api.listSessions({});
      if (!response?.success) {
        throw new Error(
          response?.error?.message ??
            "Could not load recent practice sessions.",
        );
      }
      setRecentSessions((response.data ?? []).slice(0, 5));
    } catch (cause) {
      setRecentError(
        cause instanceof Error
          ? cause.message
          : "Could not load recent practice sessions.",
      );
    } finally {
      setRecentLoading(false);
    }
  }, [api]);

  const load = useCallback(
    async (id: string) => {
      if (!id || !api) {
        return;
      }
      setSessionLoading(true);
      setError(undefined);
      try {
        const response = await api.getSession({ sessionId: id });
        if (!response?.success || !response.data) {
          throw new Error(
            response?.error?.message ?? "Failed to load practice session.",
          );
        }
        const session = response.data as PracticeState;
        setState(session);
        setSessionId(id);
        setParams({ sessionId: id });
        if (session.status === "completed") {
          const reportResponse = await api.getReport({ sessionId: id });
          if (reportResponse?.success && reportResponse.data) {
            setReport(reportResponse.data as PracticeReport);
          }
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Failed to load practice session.",
        );
      } finally {
        setSessionLoading(false);
      }
    },
    [api, setParams],
  );

  useEffect(() => {
    if (initialSessionId) {
      void load(initialSessionId);
    } else {
      void refreshRecent();
    }
    // Initial URL determines whether the page opens in setup or session view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createAndStart = async () => {
    setBusy(true);
    setError(undefined);
    setStatusMsg(undefined);
    setResult(undefined);
    setReport(undefined);
    try {
      if (!api)
        throw new Error(
          "Practice API unavailable. Open this page in VEYRA Desktop.",
        );
      const created = await api.createSession({
        targetRole: targetRole.trim() || "Interview Candidate",
        questionCount,
        interviewType,
        difficulty,
        domain,
        jobDescription: jobDescription.trim() || undefined,
      });
      if (!created?.success || !created?.data?.id) {
        throw new Error(
          created?.error?.message ?? "Failed to create practice session.",
        );
      }
      await load(created.data.id);
      setStatusMsg(
        "Practice session started. Your response is saved locally with this session.",
      );
      await refreshRecent();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to start practice.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!currentQuestion?.id || !sessionId || !answerText.trim() || !api)
      return;
    setBusy(true);
    setError(undefined);
    setStatusMsg(undefined);
    try {
      const response = await api.submitAnswer({
        sessionId,
        questionId: currentQuestion.id,
        answerText: answerText.trim(),
      });
      if (!response?.success) {
        throw new Error(response?.error?.message ?? "Failed to submit answer.");
      }
      setResult(response.data as PracticeResult);
      setAnswerText("");
      await load(sessionId);
      if (response.data?.isSessionCompleted) {
        const reportResponse = await api.getReport({ sessionId });
        if (reportResponse?.success)
          setReport(reportResponse.data as PracticeReport);
      }
      await refreshRecent();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to submit answer.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateSessionStatus = async (
    action: "pauseSession" | "resumeSession",
  ) => {
    if (!sessionId || !api) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api[action]({ sessionId });
      if (!response?.success)
        throw new Error(
          response?.error?.message ?? "Could not update session.",
        );
      await load(sessionId);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update session.",
      );
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!sessionId || !api) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.completeSession({ sessionId });
      if (!response?.success)
        throw new Error(
          response?.error?.message ?? "Could not complete session.",
        );
      setReport(response.data as PracticeReport);
      await load(sessionId);
      await refreshRecent();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Failed to complete practice session.",
      );
    } finally {
      setBusy(false);
    }
  };

  const evaluationGaps = useMemo(() => {
    const gaps =
      result?.evaluation?.gaps ?? result?.evaluation?.missedOpportunities;
    return Array.isArray(gaps) ? gaps.slice(0, 4) : [];
  }, [result]);

  return (
    <PageContainer>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5638C4]">
            Practice Studio
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.02em] text-[#0F1B3D]">
            {state
              ? "Your practice session"
              : "Build confidence, one answer at a time."}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#3B4766]">
            {state
              ? "Work through each question at your pace, then review feedback grounded in the answer you submitted."
              : "Choose a focus and role, then work through written questions and review your answers."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/history">
            <Button variant="outline">
              <History size={15} />
              Session history
            </Button>
          </Link>
          {state && (
            <Button
              variant="secondary"
              onClick={() => {
                setState(undefined);
                setSessionId("");
                setResult(undefined);
                setReport(undefined);
                setParams({});
                void refreshRecent();
              }}
            >
              <RotateCcw size={15} />
              New practice
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-[#F2C8C8] bg-[#FDECEC] px-4 py-3 text-sm text-[#8E2929]"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      {statusMsg && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-[#B9E4D0] bg-[#E6F5EE] px-4 py-3 text-sm text-[#1F8A5B]"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {statusMsg}
        </div>
      )}
      {!api && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-[#F0D89E] bg-[#FFF4DC] px-3 py-2 text-sm text-[#805100]"
        >
          The Desktop practice service is unavailable in this preview. Practice
          sessions can be created only in VEYRA Desktop.
        </p>
      )}

      {sessionLoading ? (
        <Card aria-busy="true">
          <CardContent className="flex min-h-52 items-center justify-center text-sm text-[#6B7694]">
            Loading saved practice session…
          </CardContent>
        </Card>
      ) : !state ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
          <Card className="border-[#E4E7F0] bg-white">
            <CardHeader className="border-b border-[#E4E7F0] pb-4">
              <div className="flex items-center gap-2 text-[#5638C4]">
                <Target size={18} />
                <h2 className="text-base font-semibold text-[#0F1B3D]">
                  Set up your session
                </h2>
              </div>
              <p className="text-sm leading-5 text-[#6B7694]">
                Choose the interview style and context VEYRA should use.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-[#0F1B3D]">
                  Interview type
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {INTERVIEW_TYPES.map((item) => {
                    const selected = interviewType === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setInterviewType(item.value)}
                        className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] ${selected ? "border-[#6B4FE0] bg-[#F5F2FF] ring-1 ring-[#D6CBFF]" : "border-[#E4E7F0] bg-white hover:bg-[#F7F8FC]"}`}
                      >
                        <span className="block text-sm font-semibold text-[#0F1B3D]">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-[#6B7694]">
                          {item.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-[#3B4766]">
                  Target role
                  <input
                    maxLength={160}
                    value={targetRole}
                    onChange={(event) => setTargetRole(event.target.value)}
                    placeholder="e.g. Product designer"
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-[#E4E7F0] bg-white px-3 text-sm text-[#0F1B3D] outline-none focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15"
                  />
                </label>
                <label className="text-sm font-medium text-[#3B4766]">
                  Professional domain
                  <select
                    value={domain}
                    onChange={(event) =>
                      setDomain(event.target.value as typeof domain)
                    }
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-[#E4E7F0] bg-white px-3 text-sm text-[#0F1B3D] outline-none focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15"
                  >
                    {INTERVIEW_DOMAINS.map((value) => (
                      <option key={value} value={value}>
                        {INTERVIEW_DOMAIN_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block text-sm font-medium text-[#3B4766]">
                Job description or interview context{" "}
                <span className="font-normal text-[#6B7694]">(optional)</span>
                <textarea
                  maxLength={8000}
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  placeholder="Paste role context to tailor the questions. This stays in the local practice session."
                  className="mt-1.5 min-h-20 w-full resize-y rounded-[10px] border border-[#E4E7F0] bg-white px-3 py-2.5 text-sm leading-5 text-[#0F1B3D] outline-none placeholder:text-[#6B7694] focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-[#0F1B3D]">
                    Difficulty
                  </legend>
                  <div className="flex rounded-[10px] border border-[#E4E7F0] bg-[#F7F8FC] p-1">
                    {DIFFICULTIES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        aria-pressed={difficulty === item.value}
                        onClick={() => setDifficulty(item.value)}
                        className={`min-h-8 flex-1 rounded-md px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B4FE0] ${difficulty === item.value ? "bg-white text-[#5638C4] shadow-sm" : "text-[#6B7694] hover:text-[#3B4766]"}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="text-sm font-medium text-[#3B4766]">
                  Questions
                  <select
                    value={questionCount}
                    onChange={(event) =>
                      setQuestionCount(Number(event.target.value))
                    }
                    className="mt-1.5 h-10 w-full rounded-[10px] border border-[#E4E7F0] bg-white px-3 text-sm text-[#0F1B3D] outline-none focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15"
                  >
                    <option value={3}>3 questions</option>
                    <option value={5}>5 questions</option>
                    <option value={8}>8 questions</option>
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-[#E4E7F0] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-xs text-[#6B7694]">
                  <MessageSquareText size={15} />
                  Written answers · voice practice is not enabled here.
                </p>
                <Button
                  onClick={() => void createAndStart()}
                  loading={busy}
                  disabled={busy || !api}
                  className="shrink-0"
                >
                  <Play size={15} />
                  Start practice
                </Button>
              </div>
            </CardContent>
          </Card>

          <aside className="space-y-4">
            <Card className="border-[#E4E7F0] bg-white">
              <CardHeader className="flex-row items-center justify-between pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpenCheck size={17} className="text-[#5638C4]" />
                    <h2 className="text-sm font-semibold text-[#0F1B3D]">
                      Recent sessions
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-[#6B7694]">
                    Saved to your active local profile
                  </p>
                </div>
                <Link
                  to="/history"
                  aria-label="Open session history"
                  className="rounded-full p-2 text-[#5638C4] hover:bg-[#F5F2FF]"
                >
                  <ChevronRight size={17} />
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {recentLoading ? (
                  <p className="py-3 text-sm text-[#6B7694]">
                    Loading recent sessions…
                  </p>
                ) : recentError ? (
                  <p role="alert" className="py-3 text-xs text-[#8E2929]">
                    {recentError}
                  </p>
                ) : recentSessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#D6CBFF] bg-[#F7F8FC] px-4 py-5 text-center">
                    <p className="text-sm font-medium text-[#0F1B3D]">
                      No practice sessions yet
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#6B7694]">
                      Your saved sessions and feedback will appear here after
                      your first practice.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#E4E7F0]">
                    {recentSessions.map((session) => (
                      <li
                        key={session.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-[#0F1B3D]">
                            {session.title ??
                              session.targetRole ??
                              "Practice session"}
                          </p>
                          <p className="mt-1 truncate text-[11px] text-[#6B7694]">
                            {session.status ?? "Saved"} ·{" "}
                            {session.questionsAnswered ?? 0}/
                            {session.questionCount ?? "—"} answered
                          </p>
                        </div>
                        <Link
                          to={`/practice?sessionId=${encodeURIComponent(session.id)}`}
                          aria-label={`Open ${session.title ?? session.targetRole ?? "practice session"}`}
                          className="shrink-0 rounded-full p-2 text-[#5638C4] hover:bg-[#F5F2FF]"
                        >
                          <ArrowRight size={15} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <div className="rounded-xl border border-[#E4E7F0] bg-[#F7F8FC] p-4">
              <div className="flex items-center gap-2 text-[#5638C4]">
                <FileText size={16} />
                <p className="text-xs font-semibold text-[#0F1B3D]">
                  Your context stays yours
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#3B4766]">
                Answers and feedback are saved with this local practice session.
                Add only real experiences; VEYRA does not invent candidate
                facts.
              </p>
              <Link
                to="/documents"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#5638C4] hover:underline"
              >
                Manage documents <ArrowRight size={13} />
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <>
          <Card className="mb-4 border-[#E4E7F0] bg-white">
            <CardContent className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EAE4FF] text-[#5638C4]">
                  <Target size={18} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#0F1B3D]">
                    {state.targetRole ?? "Practice session"}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#6B7694]">
                    {state.domain
                      ? (INTERVIEW_DOMAIN_LABELS[
                          state.domain as keyof typeof INTERVIEW_DOMAIN_LABELS
                        ] ?? state.domain)
                      : "General domain"}{" "}
                    · {state.status === "active" ? "In progress" : state.status}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:min-w-56">
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between text-[11px] text-[#6B7694]">
                    <span>Progress</span>
                    <span>
                      {state.questionsAnswered}/{state.questionCount}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EAE4FF]">
                    <div
                      className="h-full rounded-full bg-[#6B4FE0] transition-[width]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-[#6B7694]">
                  <Clock3 size={13} />
                  {Math.max(
                    0,
                    state.questionCount - state.questionsAnswered,
                  )}{" "}
                  left
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
            <Card className="border-[#E4E7F0] bg-white">
              <CardHeader className="border-b border-[#E4E7F0] pb-4">
                <div className="flex items-center gap-2 text-[#5638C4]">
                  <Sparkles size={17} />
                  <h2 className="text-sm font-semibold text-[#0F1B3D]">
                    {currentQuestion
                      ? `Question ${currentQuestion.sequenceNumber} of ${state.questionCount}`
                      : "Practice question"}
                  </h2>
                </div>
                <p className="text-xs text-[#6B7694]">
                  {currentQuestion
                    ? `${currentQuestion.type.replaceAll("_", " ")}${currentQuestion.isFollowUp ? " · Follow-up" : ""}`
                    : "Your practice session"}
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-5">
                {currentQuestion ? (
                  <>
                    <div className="rounded-xl border border-[#D6CBFF] bg-[#F5F2FF] p-4 sm:p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5638C4]">
                        Take a moment to think
                      </p>
                      <p className="mt-2 text-base font-medium leading-7 text-[#0F1B3D] sm:text-lg">
                        {currentQuestion.text}
                      </p>
                    </div>
                    <label className="block text-sm font-semibold text-[#0F1B3D]">
                      Your answer
                      <textarea
                        value={answerText}
                        onChange={(event) => setAnswerText(event.target.value)}
                        disabled={state.status !== "active" || busy}
                        placeholder="Use a real example from your experience. Include the situation, the action you took, and what happened."
                        className="mt-2 min-h-40 w-full resize-y rounded-xl border border-[#E4E7F0] bg-white px-3.5 py-3 text-sm leading-6 text-[#0F1B3D] outline-none placeholder:text-[#6B7694] focus:border-[#6B4FE0] focus:ring-2 focus:ring-[#6B4FE0]/15 disabled:bg-[#F7F8FC]"
                      />
                    </label>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E4E7F0] pt-4">
                      <p className="text-xs text-[#6B7694]">
                        Your answer is saved to this session on this device.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => void complete()}
                          disabled={busy}
                        >
                          <CheckCircle2 size={14} />
                          Finish session
                        </Button>
                        {state.status === "active" ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              void updateSessionStatus("pauseSession")
                            }
                            disabled={busy}
                          >
                            <Pause size={14} />
                            Pause
                          </Button>
                        ) : state.status === "paused" ? (
                          <Button
                            variant="outline"
                            onClick={() =>
                              void updateSessionStatus("resumeSession")
                            }
                            disabled={busy}
                          >
                            <Play size={14} />
                            Resume
                          </Button>
                        ) : null}
                        <Button
                          onClick={() => void submit()}
                          loading={busy}
                          disabled={
                            busy ||
                            state.status !== "active" ||
                            !answerText.trim()
                          }
                        >
                          Submit answer <ArrowRight size={14} />
                        </Button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-[#D6CBFF] bg-[#F7F8FC] p-6 text-center">
                    <p className="text-sm font-medium text-[#0F1B3D]">
                      {state.status === "completed"
                        ? "This session is complete."
                        : "There is no active question."}
                    </p>
                    <p className="mt-1 text-xs text-[#6B7694]">
                      {state.status === "completed"
                        ? "Review the saved report alongside your submitted answers."
                        : "Start a new practice session or open one from your history."}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[#E4E7F0] bg-white">
              <CardHeader className="border-b border-[#E4E7F0] pb-4">
                <div className="flex items-center gap-2 text-[#5638C4]">
                  <BookOpenCheck size={17} />
                  <h2 className="text-sm font-semibold text-[#0F1B3D]">
                    Feedback & reflection
                  </h2>
                </div>
                <p className="text-xs text-[#6B7694]">
                  Based on your submitted response
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                {!result && !report && (
                  <div className="rounded-xl bg-[#F7F8FC] p-4">
                    <p className="text-sm font-medium text-[#0F1B3D]">
                      Feedback appears after you answer
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#6B7694]">
                      The review uses your submitted answer. No candidate
                      information is added unless you provide it.
                    </p>
                  </div>
                )}
                {result?.evaluation && (
                  <div className="space-y-4">
                    {Number.isFinite(result.evaluation.overallScore) && (
                      <div className="rounded-xl border border-[#D6CBFF] bg-[#F5F2FF] p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5638C4]">
                          Answer score
                        </p>
                        <p className="mt-1 text-3xl font-semibold tabular-nums text-[#0F1B3D]">
                          {result.evaluation.overallScore}
                          <span className="ml-1 text-sm font-medium text-[#6B7694]">
                            /100
                          </span>
                        </p>
                      </div>
                    )}
                    {result.communicationFeedback?.overallRating && (
                      <p className="text-sm text-[#3B4766]">
                        Communication:{" "}
                        <span className="font-semibold text-[#0F1B3D]">
                          {result.communicationFeedback.overallRating}
                        </span>
                      </p>
                    )}
                    {!!result.evaluation.strengths?.length && (
                      <FeedbackList
                        title="What worked"
                        items={result.evaluation.strengths.slice(0, 4)}
                        tone="positive"
                      />
                    )}
                    {!!evaluationGaps.length && (
                      <FeedbackList
                        title="Consider adding"
                        items={evaluationGaps}
                        tone="neutral"
                      />
                    )}
                    {!!result.followUps?.length && (
                      <div className="border-t border-[#E4E7F0] pt-3">
                        <p className="text-xs font-semibold text-[#0F1B3D]">
                          Possible follow-up
                        </p>
                        <p className="mt-1 text-sm leading-5 text-[#3B4766]">
                          {result.followUps[0].questionText ??
                            "Review a related question in the next session."}
                        </p>
                      </div>
                    )}
                    {evaluationGaps.length > 0 && (
                      <p className="rounded-lg bg-[#FFF4DC] px-3 py-2 text-[11px] leading-4 text-[#805100]">
                        Suggestions refer to the answer you provided. Add only
                        details that are true for you.
                      </p>
                    )}
                  </div>
                )}
                {report && (
                  <div className="space-y-3 border-t border-[#E4E7F0] pt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#6B7694]">
                      Session report
                    </p>
                    {Number.isFinite(report.overallScore) && (
                      <p className="text-2xl font-semibold text-[#0F1B3D]">
                        {report.overallScore}
                        <span className="ml-1 text-sm font-medium text-[#6B7694]">
                          /100
                        </span>
                      </p>
                    )}
                    {report.overallAssessment && (
                      <p className="text-sm leading-5 text-[#3B4766]">
                        {report.overallAssessment}
                      </p>
                    )}
                    {!!report.recommendedLearningAreas?.length && (
                      <FeedbackList
                        title="Recommended focus"
                        items={report.recommendedLearningAreas.slice(0, 4)}
                        tone="neutral"
                      />
                    )}
                  </div>
                )}
                <Link
                  to={`/history/${encodeURIComponent(sessionId)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#5638C4] hover:underline"
                >
                  Open saved session details <ChevronRight size={14} />
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </PageContainer>
  );
}

function FeedbackList({
  title,
  items,
  tone,
}: {
  readonly title: string;
  readonly items: readonly string[];
  readonly tone: "positive" | "neutral";
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#0F1B3D]">{title}</p>
      <ul
        className={`mt-2 space-y-2 ${tone === "positive" ? "text-[#1F8A5B]" : "text-[#3B4766]"}`}
      >
        {items.map((item, index) => (
          <li key={`${index}-${item}`} className="flex gap-2 text-sm leading-5">
            <span
              aria-hidden="true"
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone === "positive" ? "bg-[#1F8A5B]" : "bg-[#6B4FE0]"}`}
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

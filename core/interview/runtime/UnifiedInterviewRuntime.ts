import { randomUUID } from "node:crypto";

import type { AIManager } from "../../ai/AIManager";
import type { AIRequest } from "../../ai/AIRequest";
import type { AIResponse } from "../../ai/AIResponse";
import type { ContextManager } from "../../context/ContextManager";
import type { InterviewIntelligence } from "../services/InterviewIntelligence";
import type {
  CandidateEvidenceItem,
} from "../planning/AnswerPlanningEngine";
import type { SessionRepository } from "../../../database/repositories/sessionRepository";
import type { QuestionRepository } from "../../../database/repositories/questionRepository";
import type { AnswerRepository } from "../../../database/repositories/answerRepository";
import type { MemoryRepository } from "../../../database/repositories/memoryRepository";
import type { PracticeSessionReport, SessionMode, SessionStatus } from "../../../database/schema/sessions";
import type {
  AnswerEvaluation,
  CommunicationFeedback,
  FollowUpQuestion,
  InterviewAnalysis,
  InterviewDomain,
  InterviewDomainClassification,
  QuestionUnderstanding,
  ResponseMode,
} from "../../../shared/types/interviews";
import type { ConversationAnalysis, TranscriptSegment } from "../../../shared/types/conversation";
import { ConversationAnalyzer } from "../../conversation/services/ConversationAnalyzer";
import { InterviewError } from "../errors/InterviewError";

export type InterviewRuntimeMode = "practice" | "live";
export type InterviewInputSource = "typed" | "voice_transcript" | "screen_context" | "practice_answer";

export interface UnifiedInterviewSessionConfig {
  readonly profileId: string;
  readonly candidateId?: string;
  readonly mode: InterviewRuntimeMode;
  readonly targetRole?: string;
  readonly domain?: InterviewDomain;
  readonly interviewType?: SessionMode;
  readonly jobDescription?: string;
  readonly questionCount?: number;
  readonly title?: string;
}

export interface InterviewRuntimeEvidence {
  readonly id: string;
  readonly source: "candidate" | "memory" | "context";
  readonly text: string;
  readonly verified?: boolean;
}

export interface InterviewRuntimeResponse {
  readonly sessionId: string;
  readonly mode: InterviewRuntimeMode;
  readonly source: InterviewInputSource;
  readonly questionText: string;
  readonly conversation: ConversationAnalysis;
  readonly analysis: InterviewAnalysis;
  readonly domain: InterviewDomainClassification;
  readonly understanding: QuestionUnderstanding;
  readonly guidance: {
    readonly headline?: string;
    readonly talkingPoints: readonly string[];
    readonly cautions: readonly string[];
    readonly structure?: readonly string[];
  };
  readonly evidence: readonly InterviewRuntimeEvidence[];
  readonly provenance: {
    readonly candidateEvidenceIds: readonly string[];
    readonly memoryIds: readonly string[];
    readonly contextIds: readonly string[];
    readonly factsGrounded: boolean;
    readonly assumptions: readonly string[];
    readonly missingInformation: readonly string[];
  };
  readonly confidence: number;
  readonly followUps: readonly FollowUpQuestion[];
  readonly ai?: {
    readonly provider?: string;
    readonly model?: string;
    readonly requestId?: string;
    readonly text?: string;
    readonly executed: boolean;
    readonly unavailableReason?: string;
  };
  readonly questionId?: string;
}

export interface InterviewRuntimeAnswerResult extends InterviewRuntimeResponse {
  readonly answerId: string;
  readonly evaluation: AnswerEvaluation;
  readonly communication: CommunicationFeedback;
  readonly completed: boolean;
  readonly report?: PracticeSessionReport;
}

export interface UnifiedInterviewRuntimeOptions {
  readonly interviewIntelligence: InterviewIntelligence;
  readonly sessionRepository: SessionRepository;
  readonly questionRepository: QuestionRepository;
  readonly answerRepository: AnswerRepository;
  readonly memoryRepository?: MemoryRepository;
  readonly contextManager?: ContextManager;
  readonly aiManager?: AIManager;
  readonly resolveProfileId?: () => string | undefined;
  readonly retrieveCandidateContext?: (
    profileId: string,
    candidateId: string | undefined,
    query: string,
    signal?: AbortSignal,
  ) => Promise<readonly InterviewRuntimeEvidence[]>;
}

export interface RuntimeSessionState {
  readonly sessionId: string;
  readonly profileId: string;
  readonly candidateId?: string;
  readonly mode: InterviewRuntimeMode;
  readonly status: SessionStatus;
  readonly turns: ConversationAnalysis[];
  readonly lastQuestionId?: string;
  readonly lastGuidance?: InterviewRuntimeResponse;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clampQuestionCount(value: number | undefined): number {
  return Math.min(20, Math.max(1, Math.round(value ?? 5)));
}

function toRuntimeStatus(status: SessionStatus, mode: InterviewRuntimeMode): SessionStatus {
  if (status === "draft" && mode === "live") return "draft";
  return status;
}

export class UnifiedInterviewRuntime {
  private readonly analyzer = new ConversationAnalyzer();
  private readonly sessions = new Map<string, RuntimeSessionState>();

  public constructor(private readonly options: UnifiedInterviewRuntimeOptions) {}

  public async createSession(config: UnifiedInterviewSessionConfig, signal?: AbortSignal): Promise<RuntimeSessionState> {
    this.throwIfAborted(signal);
    if (!config.profileId?.trim()) {
      throw InterviewError.invalidRequest("profileId is required.");
    }
    if (config.mode !== "practice" && config.mode !== "live") {
      throw InterviewError.invalidRequest("Interview mode must be practice or live.");
    }

    const dbMode: SessionMode = config.interviewType ?? (config.mode === "practice" ? "mixed" : "mixed");
    const session = this.options.sessionRepository.create({
      profileId: config.profileId,
      title: config.title ?? (config.mode === "practice" ? `Practice: ${config.targetRole ?? "Interview"}` : `Live: ${config.targetRole ?? "Interview"}`),
      mode: dbMode,
      status: "draft",
      settings: {
        interviewMode: config.mode,
        candidateId: config.candidateId,
        targetRole: config.targetRole,
        jobDescription: config.jobDescription,
        domain: config.domain,
        questionCount: clampQuestionCount(config.questionCount),
      },
    });
    if (!session) throw InterviewError.engineFailure("Failed to create interview session.");

    const state: RuntimeSessionState = {
      sessionId: session.id,
      profileId: config.profileId,
      candidateId: config.candidateId,
      mode: config.mode,
      status: session.status,
      turns: [],
    };
    this.sessions.set(session.id, state);
    return state;
  }

  public async startSession(sessionId: string, signal?: AbortSignal): Promise<RuntimeSessionState> {
    const state = await this.requireSession(sessionId, signal);
    if (state.status === "draft" || state.status === "paused") {
      this.options.sessionRepository.updateStatus(sessionId, "active", undefined);
    }
    return this.refreshState(sessionId);
  }

  public async pauseSession(sessionId: string, signal?: AbortSignal): Promise<RuntimeSessionState> {
    await this.requireSession(sessionId, signal);
    this.options.sessionRepository.updateStatus(sessionId, "paused", undefined);
    return this.refreshState(sessionId);
  }

  public async resumeSession(sessionId: string, signal?: AbortSignal): Promise<RuntimeSessionState> {
    await this.requireSession(sessionId, signal);
    this.options.sessionRepository.updateStatus(sessionId, "active", undefined);
    return this.refreshState(sessionId);
  }

  public async cancelSession(sessionId: string, reason = "Cancelled by user", signal?: AbortSignal): Promise<RuntimeSessionState> {
    const state = await this.requireSession(sessionId, signal);
    const db = this.options.sessionRepository.getById(sessionId);
    this.options.sessionRepository.updateStatus(sessionId, "failed", nowIso());
    if (db) {
      this.options.sessionRepository.updateSettings(sessionId, {
        ...db.settings,
        cancellationReason: reason,
      });
    }
    const next = { ...state, status: "failed" as SessionStatus };
    this.sessions.set(sessionId, next);
    return next;
  }

  public async completeSession(sessionId: string, report?: PracticeSessionReport, signal?: AbortSignal): Promise<RuntimeSessionState> {
    const state = await this.requireSession(sessionId, signal);
    const db = this.options.sessionRepository.getById(sessionId);
    this.options.sessionRepository.updateStatus(sessionId, "completed", nowIso());
    if (db && report) {
      this.options.sessionRepository.updateSettings(sessionId, { ...db.settings, summaryReport: report });
    }
    const next = { ...state, status: "completed" as SessionStatus };
    this.sessions.set(sessionId, next);
    return next;
  }

  public async processQuestion(input: {
    readonly sessionId: string;
    readonly text: string;
    readonly source: InterviewInputSource;
    readonly responseMode?: ResponseMode;
    readonly generateAI?: boolean;
    readonly aiProvider?: string;
    readonly aiRequestId?: string;
    readonly signal?: AbortSignal;
  }): Promise<InterviewRuntimeResponse> {
    const state = await this.requireSession(input.sessionId, input.signal);
    this.ensureActiveForInput(state);
    this.throwIfAborted(input.signal);

    const questionText = input.text?.trim();
    if (!questionText) throw InterviewError.invalidRequest("Question text is required.");

    const conversation = this.analyzeText(input.sessionId, questionText, "participant", input.signal);
    const nextTurns = [...state.turns, conversation];
    this.sessions.set(input.sessionId, { ...state, turns: nextTurns });

    const intelligenceRequest = { conversation, candidateId: state.candidateId, signal: input.signal };
    const intelligence = await this.options.interviewIntelligence.analyze(intelligenceRequest);

    const domain = this.options.interviewIntelligence.classifyDomain(questionText);
    const understanding = this.options.interviewIntelligence.understandQuestion(questionText);
    const evidence = await this.retrieveEvidence(state, questionText, input.signal);
    const candidateEvidenceItems: CandidateEvidenceItem[] = evidence
      .filter((e) => e.source === "candidate")
      .map((e) => ({ id: e.id, text: e.text, source: e.source, confidence: e.verified ? 1 : 0.7 }));
    const plan = this.options.interviewIntelligence.planAnswer(
      understanding,
      (domain.primaryDomain as InterviewDomain) ?? "general_employment",
      candidateEvidenceItems,
      input.responseMode,
    );

    const followUps = this.options.interviewIntelligence.generateFollowUps(
      "",
      understanding,
      (domain.primaryDomain as InterviewDomain) ?? "general_employment",
    );

    const question = this.options.questionRepository.create({
      sessionId: input.sessionId,
      text: questionText,
      type: (intelligence.analysis.classification.type as any) ?? "unknown",
      confidence: Math.round((intelligence.analysis.confidence ?? 0.5) * 100),
      isFollowUp: conversation.followUp?.isFollowUp ?? false,
      classification: {
        confidence: intelligence.analysis.confidence,
        signals: [...(intelligence.analysis.signals ?? [])],
      },
    });
    if (question) {
      this.sessions.set(input.sessionId, { ...this.sessions.get(input.sessionId)!, lastQuestionId: question.id });
    }

    const ai = await this.maybeGenerateAI({
      sessionId: input.sessionId,
      questionText,
      intelligence,
      domain,
      understanding,
      evidence,
      generateAI: input.generateAI === true,
      provider: input.aiProvider,
      requestId: input.aiRequestId,
      signal: input.signal,
    });

    const assumptions = evidence.length === 0
      ? ["No verified candidate evidence was retrieved for this question."]
      : [];
    const missingInformation = understanding.assessedCompetencies.length === 0
      ? ["Question competencies could not be fully determined."]
      : [];

    const guidanceSnapshot = {
      questionText,
      questionId: question?.id,
      guidance: {
        headline: plan.headline,
        talkingPoints: plan.steps.flatMap((s) => s.keyTalkingPoints).slice(0, 8),
        cautions: plan.cautions,
        structure: plan.steps.map((s) => s.phase),
      },
      provenance: Object.freeze({
        candidateEvidenceIds: evidence.filter((e) => e.source === "candidate").map((e) => e.id),
        memoryIds: evidence.filter((e) => e.source === "memory").map((e) => e.id),
        contextIds: evidence.filter((e) => e.source === "context").map((e) => e.id),
        factsGrounded: evidence.some((e) => e.verified === true || e.source === "candidate"),
        assumptions: Object.freeze(assumptions),
        missingInformation: Object.freeze(missingInformation),
      }),
      confidence: intelligence.analysis.confidence ?? 0.5,
      followUps,
      ai,
    };

    // Persist the last guidance snapshot so a restarted runtime can surface
    // live-session guidance without re-running the full intelligence path.
    const db = this.options.sessionRepository.getById(input.sessionId);
    if (db) {
      this.options.sessionRepository.updateSettings(input.sessionId, {
        ...db.settings,
        runtimeGuidance: guidanceSnapshot,
      });
    }

    const result: InterviewRuntimeResponse = Object.freeze({
      sessionId: input.sessionId,
      mode: state.mode,
      source: input.source,
      questionText,
      conversation,
      analysis: intelligence.analysis,
      domain,
      understanding,
      guidance: guidanceSnapshot.guidance,
      evidence,
      provenance: guidanceSnapshot.provenance,
      confidence: guidanceSnapshot.confidence,
      followUps: guidanceSnapshot.followUps,
      ai: guidanceSnapshot.ai,
      questionId: guidanceSnapshot.questionId,
    });

    this.sessions.set(input.sessionId, {
      ...this.sessions.get(input.sessionId)!,
      lastGuidance: result,
    });

    return result;
  }

  public async submitAnswer(input: {
    readonly sessionId: string;
    readonly questionId: string;
    readonly answerText: string;
    readonly source?: InterviewInputSource;
    readonly signal?: AbortSignal;
  }): Promise<InterviewRuntimeAnswerResult> {
    const state = await this.requireSession(input.sessionId, input.signal);
    this.ensureActiveForInput(state);
    this.throwIfAborted(input.signal);
    const question = this.options.questionRepository.getById(input.questionId);
    if (!question) throw InterviewError.invalidRequest("Question not found.");
    if (question.sessionId !== input.sessionId) {
      throw InterviewError.invalidRequest("Question does not belong to this session.");
    }

    const dbSession = this.options.sessionRepository.getById(input.sessionId);
    if (!dbSession) throw InterviewError.engineFailure("Session not found.");
    if (dbSession.profileId !== state.profileId) {
      throw InterviewError.invalidRequest("Profile isolation violation.");
    }

    const domain = (this.options.interviewIntelligence.classifyDomain(question.text).primaryDomain as InterviewDomain) ?? "general_employment";
    const understanding = this.options.interviewIntelligence.understandQuestion(question.text);
    const evaluation = this.options.interviewIntelligence.evaluateAnswer({
      answerText: input.answerText ?? "",
      questionUnderstanding: understanding,
      domain,
      targetRole: dbSession.settings?.targetRole,
    });
    const communication = this.options.interviewIntelligence.analyzeCommunication(input.answerText ?? "");
    const followUps = this.options.interviewIntelligence.generateFollowUps(input.answerText ?? "", understanding, domain);
    const evidence = await this.retrieveEvidence(state, `${question.text}\n${input.answerText ?? ""}`, input.signal);

    const answer = this.options.answerRepository.create({
      sessionId: input.sessionId,
      questionId: input.questionId,
      confidence: evaluation.overallScore,
      payload: {
        candidateAnswerText: input.answerText ?? "",
        headline: understanding.coreIntent,
        talkingPoints: [...understanding.assessedCompetencies],
        evaluation,
        communicationFeedback: communication,
        followUps,
        evidenceIds: evidence.map((e) => e.id),
      },
    });
    if (!answer) throw InterviewError.engineFailure("Failed to persist answer.");

    const answers = this.options.answerRepository.listBySession(input.sessionId);
    const maxQuestions = dbSession.settings?.questionCount ?? 5;
    const completed = state.mode === "practice" && answers.length >= maxQuestions;
    let report: PracticeSessionReport | undefined;
    if (completed) {
      report = this.buildPracticeReport(dbSession, this.options.questionRepository.listBySession(input.sessionId), answers);
      await this.completeSession(input.sessionId, report, input.signal);
    }

    const analysisConversation = this.analyzeText(input.sessionId, question.text, "assistant", input.signal);
    const baseAnalysis = await this.options.interviewIntelligence.analyze({
      conversation: analysisConversation,
      candidateId: state.candidateId,
      signal: input.signal,
    });

    return Object.freeze({
      sessionId: input.sessionId,
      mode: state.mode,
      source: input.source ?? "practice_answer",
      questionText: question.text,
      conversation: analysisConversation,
      analysis: baseAnalysis.analysis,
      domain: this.options.interviewIntelligence.classifyDomain(question.text),
      understanding,
      guidance: {
        headline: understanding.coreIntent,
        talkingPoints: [...understanding.assessedCompetencies],
        cautions: evaluation.gaps ?? [],
        structure: ["Situation/Context", "Action/Reasoning", "Result/Learning"],
      },
      evidence,
      provenance: Object.freeze({
        candidateEvidenceIds: evidence.filter((e) => e.source === "candidate").map((e) => e.id),
        memoryIds: evidence.filter((e) => e.source === "memory").map((e) => e.id),
        contextIds: evidence.filter((e) => e.source === "context").map((e) => e.id),
        factsGrounded: evidence.length > 0,
        assumptions: Object.freeze(evidence.length ? [] : ["Answer evaluated without retrieved candidate evidence."]),
        missingInformation: Object.freeze(evaluation.gaps ?? []),
      }),
      confidence: evaluation.overallScore / 100,
      followUps,
      questionId: question.id,
      answerId: answer.id,
      evaluation,
      communication,
      completed,
      report,
    });
  }

  public async getState(sessionId: string, signal?: AbortSignal): Promise<RuntimeSessionState> {
    return this.requireSession(sessionId, signal);
  }

  private async requireSession(sessionId: string, signal?: AbortSignal): Promise<RuntimeSessionState> {
    this.throwIfAborted(signal);
    if (!sessionId?.trim()) throw InterviewError.invalidRequest("sessionId is required.");
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;
    const db = this.options.sessionRepository.getById(sessionId);
    if (!db) throw InterviewError.invalidRequest(`Session ${sessionId} not found.`);
    const activeProfile = this.options.resolveProfileId?.();
    if (activeProfile && db.profileId !== activeProfile) {
      throw InterviewError.invalidRequest("Session does not belong to active profile.");
    }
    const state: RuntimeSessionState = {
      sessionId: db.id,
      profileId: db.profileId,
      candidateId: (db.settings as any)?.candidateId,
      mode: ((db.settings as any)?.interviewMode as InterviewRuntimeMode) ?? "practice",
      status: toRuntimeStatus(db.status, (((db.settings as any)?.interviewMode as InterviewRuntimeMode) ?? "practice")),
      turns: [],
      lastGuidance: (db.settings as any)?.runtimeGuidance,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  private refreshState(sessionId: string): RuntimeSessionState {
    const db = this.options.sessionRepository.getById(sessionId);
    if (!db) throw InterviewError.invalidRequest(`Session ${sessionId} not found.`);
    const prev = this.sessions.get(sessionId);
    const state: RuntimeSessionState = {
      sessionId: db.id,
      profileId: db.profileId,
      candidateId: (db.settings as any)?.candidateId ?? prev?.candidateId,
      mode: ((db.settings as any)?.interviewMode as InterviewRuntimeMode) ?? prev?.mode ?? "practice",
      status: db.status,
      turns: prev?.turns ?? [],
      lastQuestionId: prev?.lastQuestionId,
      lastGuidance: (db.settings as any)?.runtimeGuidance ?? prev?.lastGuidance,
    };
    this.sessions.set(sessionId, state);
    return state;
  }

  private ensureActiveForInput(state: RuntimeSessionState): void {
    if (state.status === "completed") throw InterviewError.invalidRequest("Session is already completed.");
    if (state.status === "failed") throw InterviewError.invalidRequest("Session is cancelled or failed.");
    if (state.status === "paused") throw InterviewError.invalidRequest("Session is paused.");
  }

  private analyzeText(sessionId: string, text: string, speaker: "participant" | "assistant", signal?: AbortSignal): ConversationAnalysis {
    const ts = Date.now();
    const segment: TranscriptSegment = {
      id: randomUUID(),
      sessionId,
      speaker,
      speakerId: speaker === "participant" ? "candidate" : "assistant",
      text,
      startMs: ts,
      endMs: ts + 1,
      isFinal: true,
      confidence: 1,
      createdAt: nowIso(),
      source: "text",
    };
    return this.analyzer.analyze({ segment, previousQuestion: undefined, previousTopic: undefined, previousQuestions: [], signal });
  }

  private async retrieveEvidence(state: RuntimeSessionState, query: string, signal?: AbortSignal): Promise<readonly InterviewRuntimeEvidence[]> {
    this.throwIfAborted(signal);
    const items: InterviewRuntimeEvidence[] = [];
    if (this.options.retrieveCandidateContext) {
      const candidate = await this.options.retrieveCandidateContext(state.profileId, state.candidateId, query, signal);
      for (const c of candidate) items.push(c);
    }
    if (this.options.memoryRepository) {
      const memories = this.options.memoryRepository.search(state.profileId, {
        query,
        candidateId: state.candidateId ?? null,
        minConfidence: 40,
        limit: 6,
      });
      for (const m of memories) {
        const text = (m as any)?.content?.text;
        if (typeof text === "string" && text.trim()) {
          items.push({ id: String((m as any).id), source: "memory", text, verified: (m as any).verificationStatus === "verified" });
        }
      }
    }
    if (this.options.contextManager) {
      try {
        const ctx = await this.options.contextManager.query({ query, limit: 5, minScore: 0.35, signal });
        const contexts = (ctx as any)?.contexts ?? [];
        for (const c of contexts) {
          const text = typeof c?.text === "string" ? c.text : typeof c?.content === "string" ? c.content : "";
          if (text) items.push({ id: String(c?.id ?? randomUUID()), source: "context", text, verified: false });
        }
      } catch {
        // context retrieval is best-effort
      }
    }
    return Object.freeze(items.slice(0, 12));
  }

  private async maybeGenerateAI(input: {
    readonly sessionId: string;
    readonly questionText: string;
    readonly intelligence: { analysis: InterviewAnalysis; aiRequest?: AIRequest; prompt?: unknown; context?: { text?: string } };
    readonly domain: InterviewDomainClassification;
    readonly understanding: QuestionUnderstanding;
    readonly evidence: readonly InterviewRuntimeEvidence[];
    readonly generateAI: boolean;
    readonly provider?: string;
    readonly requestId?: string;
    readonly signal?: AbortSignal;
  }): Promise<InterviewRuntimeResponse["ai"]> {
    if (!input.generateAI) return { executed: false };
    if (!this.options.aiManager) {
      return { executed: false, unavailableReason: "AI manager is not configured." };
    }
    this.throwIfAborted(input.signal);

    const evidenceText = input.evidence.map((e) => `- [${e.source}${e.verified ? ",verified" : ""}] ${e.text}`).join("\n").slice(0, 4000);
    const request: AIRequest = {
      requestId: input.requestId ?? randomUUID(),
      provider: input.provider ?? "local",
      model: undefined,
      messages: [
        {
          role: "system",
          content: "You are Veyra, an interview assistant. Ground guidance in provided candidate evidence. Do not invent candidate experience or facts. State uncertainty and missing evidence clearly.",
        },
        {
          role: "user",
          content: [
            `Question: ${input.questionText}`,
            `Domain: ${input.domain.primaryDomain}`,
            `Intent: ${input.understanding.coreIntent}`,
            `Competencies: ${input.understanding.assessedCompetencies.join(", ") || "unknown"}`,
            `Candidate evidence:\n${evidenceText || "(none provided)"}`,
          ].join("\n\n"),
        },
      ],
      stream: false,
      signal: input.signal,
      metadata: { feature: "interview-runtime", sessionId: input.sessionId },
    } as AIRequest;

    try {
      const response = await this.options.aiManager.generate(request.provider ?? "local", request);
      const text = (response as any)?.text ?? (response as any)?.content ?? "";
      return {
        executed: true,
        provider: (response as any)?.metadata?.provider ?? request.provider,
        model: (response as any)?.metadata?.model ?? request.model,
        requestId: request.requestId,
        text: typeof text === "string" ? text : "",
      };
    } catch (error) {
      return {
        executed: false,
        provider: request.provider,
        requestId: request.requestId,
        unavailableReason: error instanceof Error ? error.message : "AI execution failed.",
      };
    }
  }

  private buildPracticeReport(session: any, questions: any[], answers: any[]): PracticeSessionReport {
    const evaluations: AnswerEvaluation[] = answers
      .map((a) => a.payload?.evaluation as AnswerEvaluation | undefined)
      .filter((e): e is AnswerEvaluation => Boolean(e));
    const total = evaluations.length || 1;
    const overallScore = Math.round(evaluations.reduce((s, e) => s + (e.overallScore ?? 0), 0) / total);
    const strengths = [...new Set(evaluations.flatMap((e) => e.strengths ?? []))].slice(0, 5);
    const weaknesses = [...new Set(evaluations.flatMap((e) => e.gaps ?? []))].slice(0, 5);
    return {
      overallScore,
      overallAssessment: overallScore >= 70 ? "Solid practice performance with evidence-grounded responses." : "Practice completed; focus on clarity, structure, and evidence.",
      competencyBreakdown: {},
      strengths,
      weaknesses,
      communicationQuality: { rating: overallScore >= 70 ? "Good" : "Needs Improvement", fillerWordsTotal: 0, concisenessNotes: "" },
      technicalDomainAssessment: `Domain: ${session.settings?.domain ?? "general"}`,
      missedOpportunities: weaknesses,
      recommendedLearningAreas: weaknesses.slice(0, 3),
      improvedAnswerExamples: questions.slice(0, 2).map((q) => ({ question: q.text, exampleAnswer: "State context, your specific action, measurable result, and learning." })),
      suggestedNextSessionFocus: weaknesses[0] ?? "Continue practicing role-specific questions.",
    };
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw InterviewError.cancelled({ stage: "engine" });
    }
  }
}


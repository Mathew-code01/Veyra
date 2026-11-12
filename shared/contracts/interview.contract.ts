// shared/contracts/interview.contract.ts
// Public cross-boundary contract for the Veyra Interview subsystem.
// Implementation: core/interview/services/InterviewIntelligence.ts

import type { AIRequest, AIResponse } from "../types/ai";
import type { Result } from "../types/common";
import type {
  InterviewAnalysis,
  InterviewAnalysisRequest,
  InterviewTask,
  InterviewTaskRequest,
  InterviewDomainClassification,
  QuestionUnderstanding,
  AnswerPlan,
  AnswerEvaluation,
  CommunicationFeedback,
  FollowUpQuestion,
} from "../types/interviews";

/** Response returned from the public Interview analysis boundary. */
export interface InterviewAnalysisResponse {
  readonly analysis: InterviewAnalysis;
}

/** Response returned when a caller explicitly requests task extraction. */
export interface InterviewTaskResponse {
  readonly task?: InterviewTask;
}

/** Response returned when classifying professional interview domain. */
export interface InterviewDomainClassifyResponse {
  readonly classification: InterviewDomainClassification;
}

/** Response returned when performing deep question understanding. */
export interface InterviewQuestionUnderstandResponse {
  readonly understanding: QuestionUnderstanding;
}

/** Response returned when generating structured answer plan. */
export interface InterviewPlanAnswerResponse {
  readonly plan: AnswerPlan;
}

/** Response returned when evaluating answer quality. */
export interface InterviewEvaluateAnswerResponse {
  readonly evaluation: AnswerEvaluation;
}

/** Response returned when analyzing candidate communication & grammar. */
export interface InterviewCommunicationFeedbackResponse {
  readonly feedback: CommunicationFeedback;
}

/** Response returned when generating grounded follow-up questions. */
export interface InterviewFollowUpResponse {
  readonly followUps: readonly FollowUpQuestion[];
}

/** Options for preparing an interview AI request (runtime signal excluded for IPC). */
export interface InterviewAIRequestOptions {
  readonly requestId: string;
  readonly provider?: string;
  readonly model?: string;
  readonly stream?: boolean;
  readonly timeoutMs?: number;
  readonly responseStyle?: "concise" | "balanced" | "detailed" | "interview-ready";
}

/** Prepared interview result including optional AI request (not executed). */
export interface InterviewPrepareAIResponse extends InterviewAnalysisResponse {
  readonly aiRequest?: AIRequest;
  readonly candidateId?: string;
  readonly contextText?: string;
}

/** Executed interview AI response (preparation + execution via core/ai). */
export interface InterviewExecuteAIResponse extends InterviewPrepareAIResponse {
  readonly response?: AIResponse;
}

export type InterviewAnalysisResult = Result<InterviewAnalysisResponse>;
export type InterviewTaskResult = Result<InterviewTaskResponse>;
export type InterviewPrepareAIResult = Result<InterviewPrepareAIResponse>;
export type InterviewExecuteAIResult = Result<InterviewExecuteAIResponse>;
export type InterviewDomainClassifyResult = Result<InterviewDomainClassifyResponse>;
export type InterviewQuestionUnderstandResult = Result<InterviewQuestionUnderstandResponse>;
export type InterviewPlanAnswerResult = Result<InterviewPlanAnswerResponse>;
export type InterviewEvaluateAnswerResult = Result<InterviewEvaluateAnswerResponse>;
export type InterviewCommunicationFeedbackResult = Result<InterviewCommunicationFeedbackResponse>;
export type InterviewFollowUpResult = Result<InterviewFollowUpResponse>;

/** Public cross-boundary Interview service. */
export interface InterviewServiceContract {
  analyze(request: InterviewAnalysisRequest): Promise<InterviewAnalysisResponse>;
  detectTask(request: InterviewTaskRequest): Promise<InterviewTaskResponse>;
}

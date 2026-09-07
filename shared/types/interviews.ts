// shared/types/interviews.ts

import type { ConversationAnalysis, QuestionType } from "./conversation";

import type { InterviewType } from "../constants/interviewTypes";

/**
 * Classification result for the current interview/question.
 */
export interface InterviewClassification {
  readonly type: InterviewType;

  readonly confidence: number;

  readonly alternatives: readonly {
    readonly type: InterviewType;
    readonly confidence: number;
  }[];

  readonly signals: readonly string[];

  readonly questionType?: QuestionType;
}

/**
 * Structured answer section.
 */
export interface AnswerSection {
  readonly id: string;

  readonly title: string;

  readonly content: string;

  readonly priority: "primary" | "secondary" | "optional";
}

/**
 * Structured interview guidance.
 */
export interface AnswerGuidance {
  readonly type: InterviewType;

  readonly headline: string;

  readonly sections: readonly AnswerSection[];

  readonly talkingPoints: readonly string[];

  readonly cautions: readonly string[];

  readonly confidence: number;

  readonly sourceQuestion: string;
}

/**
 * Candidate information available to an interview engine.
 */
export interface CandidateContext {
  readonly resume?: string;

  readonly experience?: readonly string[];

  readonly skills?: readonly string[];

  readonly projects?: readonly string[];

  readonly stories?: readonly string[];

  readonly achievements?: readonly string[];

  readonly education?: readonly string[];

  readonly certifications?: readonly string[];
}

/**
 * Job information available to an interview engine.
 */
export interface JobContext {
  readonly title?: string;

  readonly description?: string;

  readonly company?: string;

  readonly requirements?: readonly string[];

  readonly responsibilities?: readonly string[];
}

/**
 * Input to an interview engine.
 */
export interface InterviewEngineInput {
  readonly analysis: ConversationAnalysis;

  readonly candidateContext?: CandidateContext;

  readonly jobContext?: JobContext;
}

/**
 * Input used by the answer builder.
 */
export interface AnswerBuilderInput {
  readonly classification: InterviewClassification;

  readonly analysis: ConversationAnalysis;

  readonly guidance: AnswerGuidance;

  readonly candidateContext?: CandidateContext;

  readonly jobContext?: JobContext;
}

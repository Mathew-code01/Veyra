// shared/types/sessions.ts
import type { Entity, UUID } from "./common";

import type { InterviewType } from "../constants/interviewTypes";

import type { AIProvider } from "./ai";

export type SessionStatus =
  | "created"
  | "starting"
  | "active"
  | "paused"
  | "stopping"
  | "completed"
  | "cancelled"
  | "failed";

export interface SessionSettings {
  readonly interviewType: InterviewType;

  readonly aiProvider?: AIProvider;
  readonly aiModel?: string;

  readonly enableAudio: boolean;
  readonly enableCapture: boolean;
  readonly enableVision: boolean;

  readonly enableTranscript: boolean;
  readonly enableConversationAnalysis: boolean;

  readonly retainTranscript: boolean;
  readonly retainCaptureMetadata: boolean;
}

export interface SessionContext {
  readonly profileId?: UUID;

  readonly documentIds: readonly UUID[];

  readonly jobTitle?: string;
  readonly companyName?: string;

  readonly jobDescription?: string;
}

export interface InterviewSession extends Entity {
  readonly status: SessionStatus;

  readonly startedAt?: string;
  readonly endedAt?: string;

  readonly pausedAt?: string;

  readonly durationMs: number;

  readonly settings: SessionSettings;
  readonly context: SessionContext;
}

export interface SessionSummary {
  readonly sessionId: UUID;

  readonly questionCount: number;
  readonly answeredQuestionCount: number;

  readonly transcriptDurationMs: number;

  readonly averageResponseLatencyMs?: number;

  readonly interviewType: InterviewType;

  readonly completedAt?: string;
}
// shared/contracts/session.contract.ts


import type { UUID, Result } from "../types/common";

import type {
  InterviewSession,
  SessionContext,
  SessionSettings,
  SessionSummary,
} from "../types/sessions";

export interface SessionStartRequest {
  readonly sessionId?: UUID;

  readonly settings: SessionSettings;
  readonly context: SessionContext;
}

export interface SessionStartResponse {
  readonly session: InterviewSession;
}

export interface SessionPauseRequest {
  readonly sessionId: UUID;
}

export interface SessionPauseResponse {
  readonly session: InterviewSession;
}

export interface SessionResumeRequest {
  readonly sessionId: UUID;
}

export interface SessionResumeResponse {
  readonly session: InterviewSession;
}

export interface SessionStopRequest {
  readonly sessionId: UUID;

  readonly reason?: "completed" | "cancelled" | "error" | "user";
}

export interface SessionStopResponse {
  readonly session: InterviewSession;
  readonly summary?: SessionSummary;
}

export interface SessionGetRequest {
  readonly sessionId: UUID;
}

export interface SessionGetResponse {
  readonly session: InterviewSession;
}

export interface SessionListRequest {
  readonly page?: number;
  readonly pageSize?: number;

  readonly status?: InterviewSession["status"];
}

export interface SessionListResponse {
  readonly items: readonly InterviewSession[];

  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
    readonly totalPages: number;
    readonly hasNextPage: boolean;
  };
}

export type SessionStartResult = Result<SessionStartResponse>;

export type SessionPauseResult = Result<SessionPauseResponse>;

export type SessionResumeResult = Result<SessionResumeResponse>;

export type SessionStopResult = Result<SessionStopResponse>;

export type SessionGetResult = Result<SessionGetResponse>;

export type SessionListResult = Result<SessionListResponse>;
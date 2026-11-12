import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export type SessionStatus = "draft" | "active" | "paused" | "completed" | "failed";
export type SessionMode = "behavioral" | "technical" | "coding" | "system_design" | "product" | "case" | "communication" | "mixed";

export interface PracticeSessionReport {
  overallScore: number;
  overallAssessment: string;
  competencyBreakdown: Record<string, number>;
  strengths: readonly string[];
  weaknesses: readonly string[];
  communicationQuality: {
    rating: string;
    fillerWordsTotal: number;
    concisenessNotes: string;
  };
  technicalDomainAssessment: string;
  missedOpportunities: readonly string[];
  recommendedLearningAreas: readonly string[];
  improvedAnswerExamples: readonly { question: string; exampleAnswer: string }[];
  suggestedNextSessionFocus: string;
}

export interface SessionSettings {
  captureEnabled?: boolean;
  visionEnabled?: boolean;
  localOnly?: boolean;
  model?: string;
  targetRole?: string;
  jobDescription?: string;
  domain?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  experienceLevel?: "entry" | "mid" | "senior" | "lead" | "executive";
  questionCount?: number;
  summaryReport?: PracticeSessionReport;
  /** Unified interview runtime fields (additive). */
  interviewMode?: "practice" | "live";
  candidateId?: string;
  cancellationReason?: string;
}

export const sessions = sqliteTable(
  "sessions",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title"),
    mode: text("mode").$type<SessionMode>().notNull().default("mixed"),
    status: text("status").$type<SessionStatus>().notNull().default("draft"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    durationMs: integer("duration_ms"),
    settings: jsonText<SessionSettings>("settings").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("sessions_profile_idx").on(table.profileId),
    index("sessions_status_idx").on(table.status),
    index("sessions_started_at_idx").on(table.startedAt),
  ],
);


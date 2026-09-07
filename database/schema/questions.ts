import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText } from "./_shared";
import { sessions } from "./sessions";
import { transcripts } from "./transcripts";

export type QuestionType = "behavioral" | "technical" | "coding" | "system_design" | "product" | "case" | "communication" | "unknown";

export interface ClassificationData {
  confidence?: number;
  alternatives?: Array<{ type: string; confidence: number }>;
  signals?: string[];
}

export const questions = sqliteTable(
  "questions",
  {
    id: idColumn(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    transcriptId: text("transcript_id").references(() => transcripts.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    type: text("type").$type<QuestionType>().notNull().default("unknown"),
    confidence: integer("confidence").notNull().default(0),
    isFollowUp: integer("is_follow_up", { mode: "boolean" }).notNull().default(false),
    parentQuestionId: text("parent_question_id"),
    classification: jsonText<ClassificationData>("classification").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("questions_session_idx").on(table.sessionId),
    index("questions_type_idx").on(table.type),
    index("questions_parent_idx").on(table.parentQuestionId),
  ],
);

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText } from "./_shared";
import { sessions } from "./sessions";
import { questions } from "./questions";

export interface AnswerPayload {
  headline?: string;
  sections?: Array<{ title: string; points: string[] }>;
  talkingPoints?: string[];
  cautions?: string[];
  structure?: string;
  sourceContextIds?: string[];
}

export const answers = sqliteTable(
  "answers",
  {
    id: idColumn(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull().references(() => questions.id, { onDelete: "cascade" }),
    provider: text("provider"),
    model: text("model"),
    payload: jsonText<AnswerPayload>("payload").notNull().default({}),
    confidence: integer("confidence").notNull().default(0),
    firstTokenMs: integer("first_token_ms"),
    totalLatencyMs: integer("total_latency_ms"),
    tokenCount: integer("token_count"),
    createdAt: createdAt(),
  },
  (table) => [
    index("answers_session_idx").on(table.sessionId),
    index("answers_question_idx").on(table.questionId),
  ],
);

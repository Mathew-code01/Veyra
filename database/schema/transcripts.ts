import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText } from "./_shared";
import { sessions } from "./sessions";

export type Speaker = "interviewer" | "candidate" | "unknown";

export interface TranscriptMetadata {
  confidence?: number;
  provider?: string;
  language?: string;
  wordsPerMinute?: number;
}

export const transcripts = sqliteTable(
  "transcripts",
  {
    id: idColumn(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    speaker: text("speaker").$type<Speaker>().notNull().default("unknown"),
    text: text("text").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    isFinal: integer("is_final", { mode: "boolean" }).notNull().default(true),
    metadata: jsonText<TranscriptMetadata>("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("transcripts_session_idx").on(table.sessionId),
    index("transcripts_session_sequence_idx").on(table.sessionId, table.sequence),
  ],
);

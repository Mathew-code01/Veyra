import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText } from "./_shared";
import { sessions } from "./sessions";

export type CaptureType = "screen" | "window" | "image" | "audio";

export interface CaptureMetadata {
  width?: number;
  height?: number;
  mimeType?: string;
  sourceName?: string;
  ocrText?: string;
}

export const captures = sqliteTable(
  "captures",
  {
    id: idColumn(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    type: text("type").$type<CaptureType>().notNull(),
    storagePath: text("storage_path"),
    checksum: text("checksum"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    metadata: jsonText<CaptureMetadata>("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("captures_session_idx").on(table.sessionId),
    index("captures_type_idx").on(table.type),
  ],
);

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface DocumentMetadata {
  mimeType?: string;
  pageCount?: number;
  checksum?: string;
  language?: string;
}

export const documents = sqliteTable(
  "documents",
  {
    id: idColumn(),
    profileId: text("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    originalName: text("original_name").notNull(),
    storagePath: text("storage_path").notNull(),
    documentType: text("document_type"),
    status: text("status").$type<DocumentStatus>().notNull().default("pending"),
    sizeBytes: integer("size_bytes").notNull().default(0),
    extractedText: text("extracted_text"),
    metadata: jsonText<DocumentMetadata>("metadata").notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("documents_storage_path_unique").on(table.storagePath),
    index("documents_profile_idx").on(table.profileId),
    index("documents_status_idx").on(table.status),
  ],
);

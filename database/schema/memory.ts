// ============================================================================
// FILE: database/schema/memory.ts
//
// PURPOSE:
// Canonical Drizzle schema for persistent memory records.
//
// MEMORY CATEGORIES:
//
//   candidate   - Facts extracted from CVs, resumes, certificates,
//                 projects, portfolios and other candidate documents.
//   conversation - Useful information from previous conversations, distinct
//                 from raw conversation history.
//   session     - Context belonging to a particular interview or
//                 preparation session.
//   preference  - User-approved preferences (response length, style, etc.).
//   knowledge   - Reusable document facts, technical knowledge, professional
//                 stories, source-linked information.
//
// EVERY record is scoped to a profile_id so candidate data cannot leak
// between profiles.
//
// SOURCE TRACING:
//
//   sourceType - Broad origin (document, conversation, session, manual).
//   sourceId   - Stable source identifier (documentId, sessionId, messageId).
// ============================================================================

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, nullableTimestamp, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export type MemoryCategory =
  | "candidate"
  | "conversation"
  | "session"
  | "preference"
  | "knowledge";

export type MemoryStatus = "active" | "expired" | "deleted" | "flagged";

export type MemoryVerificationStatus =
  | "verified"
  | "inferred"
  | "missing"
  | "unverified";

export interface MemoryContent {
  readonly value: unknown;

  readonly text?: string;
}

export const memories = sqliteTable(
  "memories",
  {
    id: idColumn(),

    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    category: text("category").$type<MemoryCategory>().notNull(),

    content: jsonText<MemoryContent>("content").notNull(),

    sourceType: text("source_type").notNull(),

    sourceId: text("source_id"),

    sourceName: text("source_name"),

    confidence: integer("confidence").notNull().default(50),

    status: text("status").$type<MemoryStatus>().notNull().default("active"),

    verificationStatus: text("verification_status")
      .$type<MemoryVerificationStatus>()
      .notNull()
      .default("unverified"),

    extractionVersion: text("extraction_version"),

    expiresAt: nullableTimestamp("expires_at"),

    lastAccessedAt: nullableTimestamp("last_accessed_at"),

    createdAt: createdAt(),

    updatedAt: updatedAt(),
  },
  (table) => [
    index("memories_profile_idx").on(table.profileId),
    index("memories_category_idx").on(table.category),
    index("memories_profile_category_idx").on(table.profileId, table.category),
    index("memories_source_idx").on(table.sourceType, table.sourceId),
    uniqueIndex("memories_source_unique").on(
      table.profileId,
      table.category,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

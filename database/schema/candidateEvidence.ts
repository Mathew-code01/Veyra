// ============================================================================
// FILE: database/schema/candidateEvidence.ts
//
// PURPOSE:
// Canonical Drizzle schema for persistent candidate evidence.
//
// Candidate evidence records facts derived from documents, interviews, or
// other candidate-domain sources. Every record is scoped to both a
// profile_id and a candidate_id so candidate data cannot leak between
// profiles and evidence remains tied to its owning candidate.
//
// SOURCE TRACING:
//
//   sourceId   - Stable source identifier (documentId, analysisId, etc.).
//   sourceType - Broad origin (document, conversation, manual).
//   sourceName - Human-readable source label.
// ============================================================================

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt, idColumn, jsonText, updatedAt } from "./_shared";
import { profiles } from "./profiles";

export type CandidateEvidenceType =
  | "resume"
  | "experience"
  | "project"
  | "skill"
  | "story"
  | "education"
  | "certification";

export interface CandidateEvidenceContent {
  readonly text: string;
}

export const candidateEvidence = sqliteTable(
  "candidate_evidence",
  {
    id: idColumn(),

    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),

    candidateId: text("candidate_id").notNull(),

    type: text("type").$type<CandidateEvidenceType>().notNull(),

    text: text("text").notNull(),

    sourceId: text("source_id"),

    sourceName: text("source_name"),

    sourceType: text("source_type"),

    verified: integer("verified", { mode: "boolean" }).notNull().default(false),

    confidence: integer("confidence").notNull().default(50),

    metadata: jsonText<Record<string, unknown>>("metadata").notNull().default({}),

    createdAt: createdAt(),

    updatedAt: updatedAt(),
  },
  (table) => [
    index("candidate_evidence_profile_idx").on(table.profileId),
    index("candidate_evidence_candidate_idx").on(table.candidateId),
    index("candidate_evidence_profile_candidate_idx").on(
      table.profileId,
      table.candidateId,
    ),
    index("candidate_evidence_source_idx").on(table.sourceType, table.sourceId),
    uniqueIndex("candidate_evidence_source_unique").on(
      table.profileId,
      table.candidateId,
      table.sourceType,
      table.sourceId,
    ),
  ],
);

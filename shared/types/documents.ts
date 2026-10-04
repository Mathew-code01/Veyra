// ============================================================================
// FILE: shared/types/documents.ts
//
// PURPOSE:
// Canonical shared document contracts.
//
// This is the single shared document contract used across:
// - client
// - desktop
// - server
// - core/documents
// - core/context adapters
// - core/candidate adapters
//
// IMPORTANT:
//
// This file contains transport/domain contracts only.
//
// It must NOT contain:
// - parser implementations
// - AI provider implementations
// - database logic
// - vector-store logic
// - candidate business logic
// - context orchestration
// ============================================================================

import type { Entity, UUID } from "./common";

// ============================================================================
// DOCUMENT
// ============================================================================

export type DocumentType =
  | "resume"
  | "cover-letter"
  | "job-description"
  | "project"
  | "company-research"
  | "notes"
  | "other";

export type DocumentFormat = "pdf" | "docx" | "txt" | "md" | "json" | "unknown";

export interface DocumentMetadata {
  readonly mimeType: string;

  readonly format: DocumentFormat;

  readonly sizeBytes: number;

  readonly checksum?: string;

  readonly pageCount?: number;

  readonly wordCount?: number;
}

export interface Document extends Entity {
  readonly name: string;

  readonly type: DocumentType;

  readonly metadata: DocumentMetadata;

  readonly path?: string;

  readonly indexed: boolean;

  readonly indexedAt?: string;
}

// ============================================================================
// DOCUMENT CONTENT
// ============================================================================

export interface DocumentContent {
  readonly documentId: UUID;

  readonly text: string;

  readonly extractedAt: string;
}

// ============================================================================
// DOCUMENT CHUNK
// ============================================================================

export interface DocumentChunk {
  readonly id: UUID;

  readonly documentId: UUID;

  readonly text: string;

  readonly index: number;

  readonly startOffset: number;

  readonly endOffset: number;

  readonly tokenCount?: number;
}

// ============================================================================
// DOCUMENT LIST ITEM
// ============================================================================

export interface DocumentListItem {
  readonly id: UUID;

  readonly name: string;

  readonly type: DocumentType;

  readonly format: DocumentFormat;

  readonly sizeBytes: number;

  readonly indexed: boolean;

  readonly updatedAt: string;
}

// ============================================================================
// DOCUMENT AI ANALYSIS
// ============================================================================
//
// IMPORTANT:
//
// DocumentAnalysis is a DERIVED artifact.
//
// The original document remains authoritative.
//
// The AI is allowed to:
// - summarize
// - classify
// - extract supported facts
// - identify keywords
// - attach provenance
//
// The AI is NOT allowed to:
// - modify the original document
// - silently invent facts
// - become the source of truth
//
// Every semantic fact should point back to one or more source chunks.
// ============================================================================

export type DocumentAnalysisFactCategory =
  | "identity"
  | "contact"
  | "experience"
  | "skill"
  | "project"
  | "education"
  | "certification"
  | "achievement"
  | "preference"
  | "other";

export interface DocumentAnalysisFact {
  /**
   * Semantic category of the extracted fact.
   */
  readonly category: DocumentAnalysisFactCategory;

  /**
   * Human-readable fact derived from the document.
   *
   * Example:
   *
   * "Worked as a frontend developer for three years."
   */
  readonly fact: string;

  /**
   * AI confidence between 0 and 1.
   */
  readonly confidence: number;

  /**
   * Canonical document chunk IDs supporting this fact.
   *
   * This provides provenance and allows downstream systems
   * to trace a candidate fact back to the original document.
   */
  readonly sourceChunkIds: readonly string[];
}

/**
 * Semantic result produced by the document AI analyzer.
 *
 * This is intentionally separate from DocumentAnalysis because
 * this shape represents the AI's validated output before the
 * application adds execution metadata such as analysisId,
 * provider and timestamps.
 */
export interface DocumentAnalysisOutput {
  /**
   * AI-generated summary grounded in the document.
   */
  readonly summary: string;

  /**
   * Semantic document classification.
   */
  readonly documentType: DocumentType;

  /**
   * Extracted factual evidence.
   */
  readonly facts: readonly DocumentAnalysisFact[];

  /**
   * Important searchable terms.
   */
  readonly keywords: readonly string[];

  /**
   * Warnings generated during semantic analysis.
   */
  readonly warnings?: readonly string[];
}

/**
 * Persisted semantic analysis of a document.
 *
 * The documentId is the permanent relationship between:
 *
 * Document
 *      ↓
 * DocumentAnalysis
 *
 * Candidate and Context can consume this artifact without
 * knowing how the original document was parsed.
 */
export interface DocumentAnalysis {
  /**
   * Stable ID for this analysis execution.
   */
  readonly analysisId: UUID;

  /**
   * Original document this analysis belongs to.
   */
  readonly documentId: UUID;

  /**
   * Semantic document classification.
   */
  readonly documentType: DocumentType;

  /**
   * Original document format.
   */
  readonly format: DocumentFormat;

  /**
   * Provider that executed the analysis.
   */
  readonly provider: string;

  /**
   * Actual model used.
   */
  readonly model: string;

  /**
   * When the analysis was generated.
   */
  readonly analyzedAt: string;

  /**
   * AI-generated grounded summary.
   */
  readonly summary: string;

  /**
   * Extracted semantic facts.
   */
  readonly facts: readonly DocumentAnalysisFact[];

  /**
   * Search-oriented keywords.
   */
  readonly keywords: readonly string[];

  /**
   * Analysis warnings.
   */
  readonly warnings: readonly string[];
}

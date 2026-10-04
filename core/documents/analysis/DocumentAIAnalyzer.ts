// ============================================================================
// FILE: core/documents/analysis/DocumentAIAnalyzer.ts
//
// PURPOSE:
// Defines the document semantic-analysis boundary.
//
// DocumentService knows only this abstraction.
//
// It does not know:
// - AIManager
// - Gemini
// - Ollama
// - Mistral
// - cloud transport
// - local model runtime
//
// This keeps document processing independent from AI execution.
// ============================================================================

import type { DocumentAnalysis } from "../../../shared/types/documents";

import type { ProcessedDocument } from "../DocumentTypes";

// ============================================================================
// OPTIONS
// ============================================================================

export interface DocumentAIAnalyzerOptions {
  /**
   * Explicit AI provider selected by the composition/orchestration layer.
   *
   * Examples:
   *
   * local
   * gemini
   * mistral
   * groq
   */
  readonly providerName: string;

  /**
   * Optional explicit model.
   */
  readonly model?: string;

  /**
   * Maximum characters supplied to one semantic-analysis request.
   *
   * This controls batching, not document chunking.
   */
  readonly batchMaxCharacters?: number;

  /**
   * Maximum output tokens requested from the AI.
   */
  readonly maxTokens?: number;

  /**
   * Caller-owned cancellation signal.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// ANALYZER
// ============================================================================

export interface DocumentAIAnalyzer {
  /**
   * Analyze an already processed document.
   *
   * This method MUST treat the ProcessedDocument as the source
   * material and return a derived DocumentAnalysis artifact.
   */
  analyze(
    document: ProcessedDocument,
    options: DocumentAIAnalyzerOptions,
  ): Promise<DocumentAnalysis>;
}

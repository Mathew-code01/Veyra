
// ============================================================================
// FILE: core/documents/analysis/DocumentAIAnalyzer.ts
//
// PURPOSE:
// Defines the document semantic-analysis boundary.
//
// ARCHITECTURE:
//
// DocumentService
//       │
//       ▼
// DocumentAIAnalyzer
//       │
//       ▼
// AIManagerDocumentAnalyzer
//       │
//       ▼
// core/ai/AIManager
//       │
//       ├── LocalModelProvider
//       └── CloudAIProvider
//
// IMPORTANT:
//
// DocumentAIAnalyzer is a DOCUMENT-domain abstraction.
//
// It does NOT know:
// - AIManager
// - Gemini
// - Ollama
// - Mistral
// - Groq
// - Cerebras
// - cloud transport
// - local model runtimes
// - candidate storage
// - context storage
// - routing implementation
//
// Provider selection is supplied by the composition/orchestration layer.
//
// The analyzer transforms:
//
//     ProcessedDocument
//
// into:
//
//     DocumentAnalysis
//
// DocumentAnalysis is a DERIVED semantic artifact.
// The original ProcessedDocument remains authoritative.
// ============================================================================

import type { AIProvider } from "../../../shared/types/ai";

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
   * ollama
   * gemini
   * mistral
   * groq
   * cerebras
   * custom-provider
   *
   * The document subsystem does not select the provider.
   */
  readonly providerName: AIProvider;

  /**
   * Optional explicit model.
   *
   * When omitted, the selected provider may use its configured default
   * model.
   */
  readonly model?: string;

  /**
   * Maximum number of source characters supplied to one semantic-analysis
   * request.
   *
   * This controls AI request batching.
   *
   * It does NOT replace DocumentChunker.
   */
  readonly batchMaxCharacters?: number;

  /**
   * Maximum output tokens requested from the AI provider.
   */
  readonly maxTokens?: number;

  /**
   * Caller-owned cancellation signal.
   *
   * The document pipeline owns cancellation.
   * The analyzer only observes it.
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
   * The analyzer MUST:
   *
   * 1. Treat ProcessedDocument as authoritative source material.
   * 2. Produce a derived DocumentAnalysis artifact.
   * 3. Preserve source chunk provenance where available.
   * 4. Never mutate the ProcessedDocument.
   * 5. Never own provider routing.
   * 6. Never persist candidate/context state directly.
   */
  analyze(
    document: ProcessedDocument,
    options: DocumentAIAnalyzerOptions,
  ): Promise<DocumentAnalysis>;
}

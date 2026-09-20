
// ============================================================================
// FILE: core/documents/pipeline/DocumentPipelineStage.ts
// PURPOSE:
// Contracts for individual document-processing stages.
// ============================================================================

import type {
  DocumentProcessingRequest,
  DocumentProcessingStage,
  ParsedDocument,
  NormalizedDocument,
  DocumentChunk,
  ProcessedDocument,
} from "../DocumentTypes";

import type { IndexBatch } from "../indexing/IndexDocument";

export interface DocumentPipelineContext {
  readonly request: DocumentProcessingRequest;

  parsed?: ParsedDocument;

  normalized?: NormalizedDocument;

  chunks?: readonly DocumentChunk[];

  indexBatch?: IndexBatch;

  processed?: ProcessedDocument;

  /**
   * Mutable pipeline-local warning collection.
   *
   * The context object itself is readonly, but warnings can be accumulated
   * by stages without replacing the context.
   */
  warnings: string[];
}

export interface DocumentPipelineStage {
  /**
   * Human-readable stage name.
   */
  readonly name: string;

  /**
   * Canonical document-processing stage.
   */
  readonly stage: DocumentProcessingStage;

  /**
   * Execute this stage.
   */
  execute(
    context: DocumentPipelineContext,
  ): Promise<DocumentPipelineContext>;
}

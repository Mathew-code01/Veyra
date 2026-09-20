// ============================================================================
// FILE: core/documents/pipeline/DocumentPipelineResult.ts
// PURPOSE:
// Result returned by the document processing pipeline.
// ============================================================================

import type {
  DocumentProcessingStage,
  ProcessedDocument,
} from "../DocumentTypes";

export interface DocumentPipelineResult {
  readonly success: boolean;

  readonly document?: ProcessedDocument;

  readonly failedStage?: DocumentProcessingStage;

  readonly warnings: readonly string[];

  readonly durationMilliseconds: number;

  readonly startedAt: string;

  readonly completedAt: string;

  readonly error?: unknown;
}
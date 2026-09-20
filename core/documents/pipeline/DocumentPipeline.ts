
// ============================================================================
// FILE: core/documents/pipeline/DocumentPipeline.ts
// PURPOSE:
// Orchestrates the document-processing stages.
//
// PIPELINE:
// validation
// classification
// parsing
// extraction
// normalization
// chunking
// indexing
// storage
//
// The pipeline does not implement those concerns itself.
// ============================================================================

import {
  DocumentProcessingStage,
  DocumentProcessingStatus,
  type DocumentProcessingRequest,
} from "../DocumentTypes";

import type {
  DocumentPipelineContext,
  DocumentPipelineStage,
} from "./DocumentPipelineStage";

import type { DocumentPipelineResult } from "./DocumentPipelineResult";

export interface DocumentPipelineOptions {
  readonly continueOnStageError?: boolean;
}

export class DocumentPipeline {
  private readonly stages: readonly DocumentPipelineStage[];

  public constructor(
    stages: readonly DocumentPipelineStage[],
    private readonly options: DocumentPipelineOptions = {},
  ) {
    if (stages.length === 0) {
      throw new Error("DocumentPipeline requires at least one stage.");
    }

    this.validateStageOrder(stages);

    this.stages = [...stages];
  }

  public async process(
    request: DocumentProcessingRequest,
  ): Promise<DocumentPipelineResult> {
    const startedAt = new Date();
    const startedAtIso = startedAt.toISOString();

    const context: DocumentPipelineContext = {
      request,
      warnings: [],
    };

    let failedStage: DocumentProcessingStage | undefined;

    try {
      for (const stage of this.stages) {
        this.throwIfAborted(request.options?.signal);

        failedStage = stage.stage;

        const stageStatus = this.statusForStage(stage.stage);

        this.emitProgress(
          request,
          stage.stage,
          stageStatus,
          0,
          `Starting ${stage.name}.`,
        );

        const nextContext = await stage.execute(context);

        if (nextContext !== context) {
          context.parsed = nextContext.parsed;

          context.normalized = nextContext.normalized;

          context.chunks = nextContext.chunks;

          context.indexBatch = nextContext.indexBatch;

          context.processed = nextContext.processed;

          context.warnings.length = 0;

          context.warnings.push(...nextContext.warnings);
        }

        this.throwIfAborted(request.options?.signal);

        this.emitProgress(
          request,
          stage.stage,
          stageStatus,
          1,
          `${stage.name} completed.`,
        );
      }

      const completedAt = new Date();

      return {
        success: true,

        document: context.processed,

        warnings: [...context.warnings],

        durationMilliseconds:
          completedAt.getTime() - startedAt.getTime(),

        startedAt: startedAtIso,

        completedAt: completedAt.toISOString(),
      };
    } catch (error) {
      const completedAt = new Date();

      return {
        success: false,

        failedStage,

        warnings: [...context.warnings],

        durationMilliseconds:
          completedAt.getTime() - startedAt.getTime(),

        startedAt: startedAtIso,

        completedAt: completedAt.toISOString(),

        error,
      };
    }
  }

  private validateStageOrder(
    stages: readonly DocumentPipelineStage[],
  ): void {
    const seen = new Set<DocumentProcessingStage>();

    for (const stage of stages) {
      if (seen.has(stage.stage)) {
        throw new Error(
          `Duplicate document pipeline stage: ${stage.stage}`,
        );
      }

      seen.add(stage.stage);
    }
  }

  private statusForStage(
    stage: DocumentProcessingStage,
  ): DocumentProcessingStatus {
    switch (stage) {
      case DocumentProcessingStage.VALIDATION:
        return DocumentProcessingStatus.VALIDATING;

      case DocumentProcessingStage.CLASSIFICATION:
        return DocumentProcessingStatus.CLASSIFYING;

      case DocumentProcessingStage.PARSING:
        return DocumentProcessingStatus.PARSING;

      case DocumentProcessingStage.EXTRACTION:
        return DocumentProcessingStatus.EXTRACTING;

      case DocumentProcessingStage.NORMALIZATION:
        return DocumentProcessingStatus.NORMALIZING;

      case DocumentProcessingStage.CHUNKING:
        return DocumentProcessingStatus.CHUNKING;

      case DocumentProcessingStage.INDEXING:
        return DocumentProcessingStatus.INDEXING;

      case DocumentProcessingStage.STORAGE:
        /**
         * DocumentProcessingStatus intentionally has no separate
         * STORAGE/STORING lifecycle state.
         *
         * Storage is represented by the completed state because the
         * persisted document is the final pipeline output.
         */
        return DocumentProcessingStatus.COMPLETED;

      default:
        return DocumentProcessingStatus.PENDING;
    }
  }

  private emitProgress(
    request: DocumentProcessingRequest,
    stage: DocumentProcessingStage,
    status: DocumentProcessingStatus,
    progress: number,
    message: string,
  ): void {
    request.options?.onProgress?.({
      documentId: request.documentId,

      stage,

      status,

      progress,

      message,

      timestamp: new Date().toISOString(),
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Document processing was cancelled.");
  }
}

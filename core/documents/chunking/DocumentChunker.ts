// ============================================================================
// FILE: core/documents/chunking/DocumentChunker.ts
// PURPOSE:
// Converts a normalized document into canonical ingestion chunks.
//
// RESPONSIBILITY:
// NormalizedDocument -> DocumentChunk[]
//
// DOES NOT:
// - create embeddings
// - perform retrieval
// - access a vector database
// - call an AI provider
// - persist documents
// ============================================================================

import { DocumentError, DocumentErrorCode } from "../DocumentError";

import type {
  DocumentChunk,
  DocumentChunkSource,
  NormalizedDocument,
} from "../DocumentTypes";

import { estimateTokens, type ChunkMetadata } from "./ChunkMetadata";

import {
  ChunkStrategyAbortedError,
  StructuralChunkStrategy,
  type ChunkStrategy,
} from "./ChunkStrategy";

export interface DocumentChunkerOptions {
  readonly maxCharacters?: number;

  readonly minCharacters?: number;

  readonly overlapCharacters?: number;

  readonly strategy?: ChunkStrategy;

  readonly signal?: AbortSignal;
}

const DEFAULT_MAX_CHARACTERS = 1200;

const DEFAULT_MIN_CHARACTERS = 40;

const DEFAULT_OVERLAP_CHARACTERS = 180;

export class DocumentChunker {
  private readonly strategy: ChunkStrategy;

  public constructor(strategy: ChunkStrategy = new StructuralChunkStrategy()) {
    this.strategy = strategy;
  }

  public chunk(
    document: NormalizedDocument,
    options: DocumentChunkerOptions = {},
  ): readonly DocumentChunk[] {
    if (!document) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "A normalized document is required for chunking.",
        {
          stage: "chunking",
        },
      );
    }

    const documentId = document.identity?.id?.trim();

    if (!documentId) {
      throw new DocumentError(
        DocumentErrorCode.INVALID_INPUT,
        "Cannot chunk a document without an ID.",
        {
          stage: "chunking",
        },
      );
    }

    try {
      this.throwIfAborted(options.signal, documentId, document.type);

      if (!document.text.trim()) {
        return [];
      }

      const maxCharacters = this.normalizePositiveInteger(
        options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
        "maxCharacters",
      );

      const minCharacters = Math.min(
        maxCharacters,
        this.normalizePositiveInteger(
          options.minCharacters ?? DEFAULT_MIN_CHARACTERS,
          "minCharacters",
        ),
      );

      const overlapCharacters = Math.min(
        this.normalizeNonNegativeInteger(
          options.overlapCharacters ?? DEFAULT_OVERLAP_CHARACTERS,
          "overlapCharacters",
        ),
        Math.floor(maxCharacters / 2),
      );

      /**
       * Per-call strategy overrides the constructor strategy.
       */
      const strategy = options.strategy ?? this.strategy;

      const candidates = strategy.createCandidates(document, {
        maxCharacters,
        minCharacters,
        overlapCharacters,
        signal: options.signal,
      });

      this.throwIfAborted(options.signal, documentId, document.type);

      const chunks: DocumentChunk[] = [];

      for (let index = 0; index < candidates.length; index += 1) {
        this.throwIfAborted(options.signal, documentId, document.type);

        const candidate = candidates[index];

        if (!candidate || typeof candidate.text !== "string") {
          throw new Error(
            `Chunk strategy "${strategy.name}" returned an invalid candidate at index ${index}.`,
          );
        }

        if (!candidate.text.trim()) {
          continue;
        }

        const source: DocumentChunkSource = {
          ...candidate.source,

          documentId,
        };

        validateChunkSource(source, document.text.length);

        const chunkIndex = chunks.length;

        const tokenEstimate = estimateTokens(candidate.text);

        const metadata: ChunkMetadata = {
          documentId,

          documentType: document.type,

          chunkIndex,

          characterCount: candidate.text.length,

          tokenEstimate,

          source,
        };

        const chunkId = this.createChunkId(
          documentId,
          chunkIndex,
          source.startOffset,
          source.endOffset,
          candidate.text,
        );

        chunks.push({
          id: chunkId,

          documentId,

          index: chunkIndex,

          text: candidate.text,

          tokenEstimate,

          source,

          metadata,
        });
      }

      this.throwIfAborted(options.signal, documentId, document.type);

      return chunks;
    } catch (error) {
      if (error instanceof DocumentError) {
        throw error;
      }

      if (error instanceof ChunkStrategyAbortedError) {
        throw DocumentError.aborted(
          {
            documentId,
            documentType: document.type,
            stage: "chunking",
          },
          error.cause,
        );
      }

      throw DocumentError.from(error, DocumentErrorCode.CHUNKING_FAILED, {
        documentId,
        documentType: document.type,
        stage: "chunking",
      });
    }
  }

  private createChunkId(
    documentId: string,
    index: number,
    startOffset: number | undefined,
    endOffset: number | undefined,
    text: string,
  ): string {
    const digest = createStableHash(
      [documentId, index, startOffset ?? "", endOffset ?? "", text].join(
        "\u0000",
      ),
    );

    return `${documentId}:chunk:${index}:${digest}`;
  }

  private normalizePositiveInteger(value: number, field: string): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `${field} must be a finite number greater than zero.`,
      );
    }

    const normalized = Math.floor(value);

    if (normalized <= 0 || !Number.isSafeInteger(normalized)) {
      throw new RangeError(`${field} must be a positive safe integer.`);
    }

    return normalized;
  }

  private normalizeNonNegativeInteger(value: number, field: string): number {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `${field} must be a finite number greater than or equal to zero.`,
      );
    }

    const normalized = Math.floor(value);

    if (!Number.isSafeInteger(normalized)) {
      throw new RangeError(`${field} must be a safe integer.`);
    }

    return normalized;
  }

  private throwIfAborted(
    signal: AbortSignal | undefined,
    documentId: string,
    documentType: string,
  ): void {
    if (!signal?.aborted) {
      return;
    }

    throw DocumentError.aborted(
      {
        documentId,
        documentType,
        stage: "chunking",
      },
      signal.reason,
    );
  }
}

function validateChunkSource(
  source: DocumentChunkSource,
  textLength: number,
): void {
  if (
    source.startOffset !== undefined &&
    (!Number.isSafeInteger(source.startOffset) || source.startOffset < 0)
  ) {
    throw new Error(
      "Chunk source startOffset must be a non-negative safe integer.",
    );
  }

  if (
    source.endOffset !== undefined &&
    (!Number.isSafeInteger(source.endOffset) || source.endOffset < 0)
  ) {
    throw new Error(
      "Chunk source endOffset must be a non-negative safe integer.",
    );
  }

  if (source.startOffset !== undefined && source.startOffset > textLength) {
    throw new Error("Chunk source startOffset exceeds document text length.");
  }

  if (source.endOffset !== undefined && source.endOffset > textLength) {
    throw new Error("Chunk source endOffset exceeds document text length.");
  }

  if (
    source.startOffset !== undefined &&
    source.endOffset !== undefined &&
    source.endOffset < source.startOffset
  ) {
    throw new Error("Chunk source endOffset cannot be less than startOffset.");
  }
}

function createStableHash(value: string): string {
  /**
   * FNV-1a 32-bit.
   *
   * This is only for deterministic IDs.
   * It is NOT a cryptographic checksum.
   */
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

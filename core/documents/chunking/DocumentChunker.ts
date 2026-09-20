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

import type {
  DocumentChunk,
  DocumentChunkSource,
  NormalizedDocument,
} from "../DocumentTypes";

import { estimateTokens, type ChunkMetadata } from "./ChunkMetadata";

import { StructuralChunkStrategy, type ChunkStrategy } from "./ChunkStrategy";

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
    this.throwIfAborted(options.signal);

    if (!document.identity.id.trim()) {
      throw new Error("Cannot chunk a document without an ID.");
    }

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
      Math.max(0, options.overlapCharacters ?? DEFAULT_OVERLAP_CHARACTERS),
      Math.floor(maxCharacters / 2),
    );

    const candidates = this.strategy.createCandidates(document, {
      maxCharacters,
      minCharacters,
      overlapCharacters,
    });

    const chunks: DocumentChunk[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      this.throwIfAborted(options.signal);

      const candidate = candidates[index];

      if (!candidate.text.trim()) {
        continue;
      }

      const source: DocumentChunkSource = {
        ...candidate.source,
        documentId: document.identity.id,
      };

      const metadata: ChunkMetadata = {
        documentId: document.identity.id,
        documentType: document.type,
        chunkIndex: index,
        characterCount: candidate.text.length,
        tokenEstimate: estimateTokens(candidate.text),
        source,
      };

      chunks.push({
        id: this.createChunkId(document.identity.id, index, candidate.text),
        documentId: document.identity.id,
        index,
        text: candidate.text,
        tokenEstimate: metadata.tokenEstimate,
        source,
      });
    }

    return chunks;
  }

  private createChunkId(
    documentId: string,
    index: number,
    text: string,
  ): string {
    /*
     * Deterministic IDs are preferable for ingestion because processing
     * the same document twice should not create unrelated chunk IDs.
     */
    let hash = 2166136261;

    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    const digest = (hash >>> 0).toString(16).padStart(8, "0");

    return `${documentId}:chunk:${index}:${digest}`;
  }

  private normalizePositiveInteger(value: number, field: string): number {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} must be a finite number greater than zero.`);
    }

    return Math.floor(value);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error("Document chunking was cancelled.");
    }
  }
}

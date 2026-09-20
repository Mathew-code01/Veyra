// ============================================================================
// FILE: core/context/Chunker.ts
// PURPOSE:
// Generic text chunking for the context/RAG subsystem.
//
// IMPORTANT:
// This chunker is intentionally independent of core/documents.
//
// It can chunk:
// - documents
// - conversations
// - memories
// - web results
// - tool output
// - generated content
// - arbitrary application context
//
// It does NOT:
// - parse PDF/DOCX
// - classify files
// - normalize document metadata
// - generate embeddings
// - store vectors
// - depend on DocumentError
// ============================================================================

export interface ChunkMetadata {
  /**
   * Generic context identity.
   */
  readonly contextId: string;

  /**
   * Optional compatibility/source field for document-backed context.
   */
  readonly documentId?: string;

  readonly documentName?: string;

  readonly type?: string;

  readonly sourceType?: string;

  readonly candidateId?: string;

  readonly source?: string;

  readonly chunkIndex: number;

  /**
   * UTF-16 start offset in the exact source text supplied
   * to the chunker.
   */
  readonly startOffset: number;

  /**
   * UTF-16 exclusive end offset in the exact source text supplied
   * to the chunker.
   */
  readonly endOffset: number;

  /**
   * Character count of the returned chunk text.
   */
  readonly characterCount: number;

  /**
   * Approximate token count.
   */
  readonly tokenEstimate: number;

  readonly [key: string]: unknown;
}

export interface Chunk {
  readonly id: string;

  /**
   * Generic context identity.
   */
  readonly contextId: string;

  /**
   * Optional document identity for document-backed context.
   */
  readonly documentId?: string;

  readonly text: string;

  readonly metadata: ChunkMetadata;
}

export interface ChunkOptions {
  /**
   * Maximum number of UTF-16 code units per chunk.
   */
  readonly maxCharacters?: number;

  /**
   * Number of UTF-16 code units to overlap.
   */
  readonly overlapCharacters?: number;

  /**
   * Minimum desired chunk length.
   */
  readonly minCharacters?: number;

  /**
   * Prefer paragraph boundaries when possible.
   */
  readonly preserveParagraphs?: boolean;

  /**
   * Prefer sentence boundaries when possible.
   */
  readonly preserveSentences?: boolean;

  /**
   * Maximum number of iterations allowed for safety.
   */
  readonly maxIterations?: number;

  /**
   * Optional cancellation signal.
   */
  readonly signal?: AbortSignal;
}

export interface Chunker {
  chunk(
    contextId: string,
    text: string,
    metadata?: Readonly<Record<string, unknown>>,
    options?: ChunkOptions,
  ): readonly Chunk[];
}

/**
 * Generic cancellation error for the context subsystem.
 *
 * Deliberately does not depend on core/documents.
 */
export class ContextChunkingAbortedError extends Error {
  public readonly cause?: unknown;

  public constructor(cause?: unknown) {
    super("Context chunking was cancelled.");

    this.name = "ContextChunkingAbortedError";

    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const DEFAULT_MAX_CHARACTERS = 1200;

const DEFAULT_OVERLAP_CHARACTERS = 180;

const DEFAULT_MIN_CHARACTERS = 40;

const DEFAULT_PRESERVE_PARAGRAPHS = true;

const DEFAULT_PRESERVE_SENTENCES = true;

/**
 * Approximate token estimator.
 *
 * This is intentionally approximate.
 *
 * A tokenizer-specific implementation should be used when a
 * model-specific token budget is required.
 */
export function estimateTokens(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

function createChunkId(
  contextId: string,
  index: number,
  startOffset: number,
  endOffset: number,
  text: string,
): string {
  const digest = createStableHash(
    `${contextId}\u0000${index}\u0000${startOffset}\u0000${endOffset}\u0000${text}`,
  );

  return `${contextId}:chunk:${index}:${digest}`;
}

function createStableHash(value: string): string {
  /**
   * FNV-1a 32-bit.
   *
   * Used only for deterministic identifiers.
   *
   * It must NOT be treated as a cryptographic checksum.
   */
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export class DefaultChunker implements Chunker {
  public chunk(
    contextId: string,
    text: string,
    metadata: Readonly<Record<string, unknown>> = {},
    options: ChunkOptions = {},
  ): readonly Chunk[] {
    this.validateContextId(contextId);

    this.throwIfAborted(options.signal);

    if (typeof text !== "string") {
      throw new TypeError("Chunker text must be a string.");
    }

    if (!text.trim()) {
      return [];
    }

    const maxCharacters = normalizePositiveInteger(
      options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
      "maxCharacters",
    );

    const overlapCharacters = Math.min(
      normalizeNonNegativeInteger(
        options.overlapCharacters ?? DEFAULT_OVERLAP_CHARACTERS,
        "overlapCharacters",
      ),
      Math.floor(maxCharacters / 2),
    );

    const minCharacters = Math.min(
      maxCharacters,
      normalizePositiveInteger(
        options.minCharacters ?? DEFAULT_MIN_CHARACTERS,
        "minCharacters",
      ),
    );

    const preserveParagraphs =
      options.preserveParagraphs ?? DEFAULT_PRESERVE_PARAGRAPHS;

    const preserveSentences =
      options.preserveSentences ?? DEFAULT_PRESERVE_SENTENCES;

    const maxIterations =
      options.maxIterations ??
      calculateDefaultMaxIterations(
        text.length,
        maxCharacters,
        overlapCharacters,
      );

    validateMaxIterations(maxIterations);

    const documentId =
      typeof metadata.documentId === "string" && metadata.documentId.trim()
        ? metadata.documentId
        : undefined;

    const chunks: Chunk[] = [];

    let start = 0;
    let iteration = 0;

    while (start < text.length) {
      this.throwIfAborted(options.signal);

      iteration += 1;

      if (iteration > maxIterations) {
        throw new Error(
          "Chunking exceeded the configured safety iteration limit.",
        );
      }

      start = this.adjustStartForSurrogatePair(text, start);

      const hardEnd = Math.min(start + maxCharacters, text.length);

      let end = hardEnd;

      if (hardEnd < text.length) {
        const minimumBoundary = start + Math.floor(maxCharacters * 0.55);

        const boundary = this.findBoundary(
          text,
          start,
          hardEnd,
          minimumBoundary,
          {
            preserveParagraphs,
            preserveSentences,
          },
        );

        if (boundary > start) {
          end = boundary;
        }
      }

      end = this.adjustEndForSurrogatePair(text, start, end);

      const exactRange = this.trimRange(text, start, end);

      if (exactRange.end > exactRange.start) {
        const chunkText = text.slice(exactRange.start, exactRange.end);

        if (chunkText.length < minCharacters && chunks.length > 0) {
          const previous = chunks[chunks.length - 1];

          const mergedStart = previous.metadata.startOffset;

          const mergedEnd = exactRange.end;

          const mergedLength = mergedEnd - mergedStart;

          /**
           * Never silently violate maxCharacters.
           *
           * If merging would make the previous chunk too large,
           * keep the small final chunk instead.
           */
          if (mergedLength <= maxCharacters) {
            const mergedText = text.slice(mergedStart, mergedEnd).trim();

            const mergedIndex = previous.metadata.chunkIndex;

            const mergedMetadata: ChunkMetadata = {
              ...previous.metadata,
              contextId,
              documentId,
              chunkIndex: mergedIndex,
              startOffset: mergedStart,
              endOffset: mergedEnd,
              characterCount: mergedText.length,
              tokenEstimate: estimateTokens(mergedText),
            };

            chunks[chunks.length - 1] = {
              ...previous,
              id: createChunkId(
                contextId,
                mergedIndex,
                mergedStart,
                mergedEnd,
                mergedText,
              ),
              contextId,
              documentId,
              text: mergedText,
              metadata: mergedMetadata,
            };
          } else {
            this.pushChunk(
              chunks,
              contextId,
              documentId,
              chunkText,
              exactRange.start,
              exactRange.end,
              metadata,
            );
          }
        } else {
          this.pushChunk(
            chunks,
            contextId,
            documentId,
            chunkText,
            exactRange.start,
            exactRange.end,
            metadata,
          );
        }
      }

      if (end >= text.length) {
        break;
      }

      const nextStart = Math.max(start + 1, end - overlapCharacters);

      if (nextStart <= start) {
        throw new Error("Chunker failed to advance the input cursor.");
      }

      start = nextStart;
    }

    return chunks;
  }

  private pushChunk(
    chunks: Chunk[],
    contextId: string,
    documentId: string | undefined,
    chunkText: string,
    startOffset: number,
    endOffset: number,
    metadata: Readonly<Record<string, unknown>>,
  ): void {
    const chunkIndex = chunks.length;

    const tokenEstimate = estimateTokens(chunkText);

    const chunkMetadata: ChunkMetadata = {
      ...metadata,

      contextId,

      documentId,

      chunkIndex,

      startOffset,

      endOffset,

      characterCount: chunkText.length,

      tokenEstimate,
    };

    chunks.push({
      id: createChunkId(
        contextId,
        chunkIndex,
        startOffset,
        endOffset,
        chunkText,
      ),

      contextId,

      documentId,

      text: chunkText,

      metadata: chunkMetadata,
    });
  }

  private findBoundary(
    text: string,
    start: number,
    hardEnd: number,
    minimumBoundary: number,
    options: {
      readonly preserveParagraphs: boolean;
      readonly preserveSentences: boolean;
    },
  ): number {
    const section = text.slice(start, hardEnd);

    const minimumRelativePosition = minimumBoundary - start;

    if (options.preserveParagraphs) {
      const paragraphBreak = section.lastIndexOf("\n\n");

      if (paragraphBreak >= minimumRelativePosition) {
        return start + paragraphBreak + 2;
      }
    }

    if (options.preserveSentences) {
      const markers = [". ", "? ", "! ", ";\n", "\n"];

      let best = -1;

      for (const marker of markers) {
        const index = section.lastIndexOf(marker);

        if (index >= minimumRelativePosition) {
          best = Math.max(best, index + marker.length);
        }
      }

      if (best >= 0) {
        return start + best;
      }
    }

    /**
     * Fall back to a whitespace boundary.
     */
    for (let index = section.length - 1; index >= 0; index -= 1) {
      if (/\s/u.test(section[index]) && start + index >= minimumBoundary) {
        return start + index + 1;
      }
    }

    return hardEnd;
  }

  private trimRange(
    text: string,
    start: number,
    end: number,
  ): {
    readonly start: number;
    readonly end: number;
  } {
    let actualStart = start;
    let actualEnd = end;

    while (actualStart < actualEnd && /\s/u.test(text[actualStart])) {
      actualStart += 1;
    }

    while (actualEnd > actualStart && /\s/u.test(text[actualEnd - 1])) {
      actualEnd -= 1;
    }

    return {
      start: actualStart,
      end: actualEnd,
    };
  }

  private adjustStartForSurrogatePair(text: string, start: number): number {
    if (start <= 0 || start >= text.length) {
      return start;
    }

    const previous = text.charCodeAt(start - 1);

    const current = text.charCodeAt(start);

    /**
     * If start points at a low surrogate whose preceding
     * code unit is a high surrogate, move backwards.
     */
    if (
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      current >= 0xdc00 &&
      current <= 0xdfff
    ) {
      return start - 1;
    }

    return start;
  }

  private adjustEndForSurrogatePair(
    text: string,
    start: number,
    end: number,
  ): number {
    if (end <= start || end >= text.length) {
      return end;
    }

    const previous = text.charCodeAt(end - 1);

    const next = text.charCodeAt(end);

    /**
     * High surrogate immediately followed by low surrogate.
     *
     * Move the boundary forward so the pair remains intact.
     */
    if (
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      next >= 0xdc00 &&
      next <= 0xdfff
    ) {
      return end + 1;
    }

    return end;
  }

  private validateContextId(contextId: string): void {
    if (typeof contextId !== "string" || !contextId.trim()) {
      throw new Error("contextId is required.");
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw new ContextChunkingAbortedError(signal.reason);
  }
}

function calculateDefaultMaxIterations(
  textLength: number,
  maxCharacters: number,
  overlapCharacters: number,
): number {
  const effectiveAdvance = Math.max(1, maxCharacters - overlapCharacters);

  const estimatedIterations = Math.ceil(textLength / effectiveAdvance);

  const calculated = Math.max(1000, estimatedIterations * 4);

  if (!Number.isSafeInteger(calculated)) {
    throw new RangeError(
      "Calculated chunking iteration limit exceeds the safe integer range.",
    );
  }

  return calculated;
}

function validateMaxIterations(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("maxIterations must be a positive safe integer.");
  }
}

function normalizePositiveInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be a finite number greater than zero.`);
  }

  const normalized = Math.floor(value);

  if (normalized <= 0 || !Number.isSafeInteger(normalized)) {
    throw new RangeError(`${field} must be a positive safe integer.`);
  }

  return normalized;
}

function normalizeNonNegativeInteger(value: number, field: string): number {
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

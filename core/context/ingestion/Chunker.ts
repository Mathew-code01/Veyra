// ============================================================================
// FILE: core/context/ingestion/Chunker.ts
//
// PURPOSE:
// Generic text chunking for the Context/RAG subsystem.
//
// THIS COMPONENT CAN CHUNK:
// - documents
// - conversations
// - transcripts
// - memories
// - web results
// - tool output
// - generated content
// - application state
// - arbitrary Context
//
// IT DOES NOT:
// - parse PDF/DOCX
// - classify documents
// - normalize document metadata
// - generate embeddings
// - store vectors
// - depend on another core domain
// ============================================================================

import type {
  ContextContentType,
  ContextScope,
  ContextSource,
} from "../contracts/contextTypes";

// ============================================================================
// METADATA
// ============================================================================

export interface ChunkMetadata {
  readonly contextId: string;

  readonly sourceType: ContextSource["type"];

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly contentType: ContextContentType;

  readonly scope?: ContextScope;

  readonly chunkIndex: number;

  readonly startOffset: number;

  readonly endOffset: number;

  readonly characterCount: number;

  readonly tokenEstimate: number;

  readonly [key: string]: unknown;
}

// ============================================================================
// CHUNK
// ============================================================================

export interface Chunk {
  readonly id: string;

  readonly contextId: string;

  readonly text: string;

  readonly metadata: ChunkMetadata;
}

// ============================================================================
// OPTIONS
// ============================================================================

export interface ChunkOptions {
  readonly maxCharacters?: number;

  readonly overlapCharacters?: number;

  readonly minCharacters?: number;

  readonly preserveParagraphs?: boolean;

  readonly preserveSentences?: boolean;

  readonly maxIterations?: number;

  readonly signal?: AbortSignal;
}

// ============================================================================
// CONTRACT
// ============================================================================

export interface Chunker {
  chunk(
    contextId: string,
    text: string,
    metadata: Readonly<Record<string, unknown>>,
    options?: ChunkOptions,
  ): readonly Chunk[];
}

// ============================================================================
// ERRORS
// ============================================================================

export class ContextChunkingAbortedError extends Error {
  public readonly cause?: unknown;

  public constructor(cause?: unknown) {
    super("Context chunking was cancelled.");

    this.name = "ContextChunkingAbortedError";

    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_CHARACTERS = 1200;

const DEFAULT_OVERLAP_CHARACTERS = 180;

const DEFAULT_MIN_CHARACTERS = 40;

const DEFAULT_PRESERVE_PARAGRAPHS = true;

const DEFAULT_PRESERVE_SENTENCES = true;

// ============================================================================
// TOKEN ESTIMATION
// ============================================================================

export function estimateTokens(text: string): number {
  const normalized = text.trim();

  if (!normalized) {
    return 0;
  }

  return Math.max(1, Math.ceil(normalized.length / 4));
}

// ============================================================================
// IDENTIFIERS
// ============================================================================

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
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ============================================================================
// DEFAULT IMPLEMENTATION
// ============================================================================

export class DefaultChunker implements Chunker {
  public chunk(
    contextId: string,
    text: string,
    metadata: Readonly<Record<string, unknown>>,
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

    const sourceType =
      typeof metadata.sourceType === "string" && metadata.sourceType.trim()
        ? metadata.sourceType
        : "unknown";

    const contentType =
      typeof metadata.contentType === "string" && metadata.contentType.trim()
        ? metadata.contentType
        : "generic";

    const sourceId =
      typeof metadata.sourceId === "string" && metadata.sourceId.trim()
        ? metadata.sourceId
        : undefined;

    const sourceName =
      typeof metadata.sourceName === "string" && metadata.sourceName.trim()
        ? metadata.sourceName
        : undefined;

    const scope = isRecord(metadata.scope) ? metadata.scope : undefined;

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

          if (previous) {
            const mergedStart = previous.metadata.startOffset;

            const mergedEnd = exactRange.end;

            const mergedLength = mergedEnd - mergedStart;

            if (mergedLength <= maxCharacters) {
              const mergedText = text.slice(mergedStart, mergedEnd);

              chunks[chunks.length - 1] = {
                ...previous,

                text: mergedText,

                metadata: {
                  ...previous.metadata,

                  endOffset: mergedEnd,

                  characterCount: mergedText.length,

                  tokenEstimate: estimateTokens(mergedText),
                },
              };

              start = this.calculateNextStart(
                mergedEnd,
                overlapCharacters,
                text.length,
              );

              continue;
            }
          }
        }

        const index = chunks.length;

        const chunkMetadata: ChunkMetadata = {
          ...metadata,

          contextId,

          sourceType: sourceType as ChunkMetadata["sourceType"],

          sourceId,

          sourceName,

          contentType: contentType as ChunkMetadata["contentType"],

          scope,

          chunkIndex: index,

          startOffset: exactRange.start,

          endOffset: exactRange.end,

          characterCount: chunkText.length,

          tokenEstimate: estimateTokens(chunkText),
        };

        chunks.push({
          id: createChunkId(
            contextId,
            index,
            exactRange.start,
            exactRange.end,
            chunkText,
          ),

          contextId,

          text: chunkText,

          metadata: chunkMetadata,
        });
      }

      const nextStart = this.calculateNextStart(
        end,
        overlapCharacters,
        text.length,
      );

      if (nextStart <= start) {
        throw new Error("Chunker failed to make forward progress.");
      }

      start = nextStart;
    }

    return chunks;
  }

  private calculateNextStart(
    end: number,
    overlap: number,
    textLength: number,
  ): number {
    if (end >= textLength) {
      return textLength;
    }

    const next = Math.max(0, end - overlap);

    return next < end ? next : end;
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
    if (options.preserveParagraphs) {
      const paragraphBoundary = findLastBoundary(
        text,
        start,
        hardEnd,
        minimumBoundary,
        (character) =>
          character === "\n" &&
          text[Math.max(start, text.lastIndexOf("\n", hardEnd - 1))] === "\n",
      );

      if (paragraphBoundary > start) {
        return paragraphBoundary;
      }
    }

    if (options.preserveSentences) {
      for (let index = hardEnd - 1; index >= minimumBoundary; index -= 1) {
        const character = text[index];

        if (character === "." || character === "!" || character === "?") {
          const nextCharacter = text[index + 1];

          if (nextCharacter === undefined || /\s/.test(nextCharacter)) {
            return index + 1;
          }
        }
      }
    }

    for (let index = hardEnd - 1; index >= minimumBoundary; index -= 1) {
      if (/\s/.test(text[index] ?? "")) {
        return index + 1;
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
    let trimmedStart = start;

    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /\s/.test(text[trimmedStart] ?? "")) {
      trimmedStart += 1;
    }

    while (trimmedEnd > trimmedStart && /\s/.test(text[trimmedEnd - 1] ?? "")) {
      trimmedEnd -= 1;
    }

    return {
      start: trimmedStart,

      end: trimmedEnd,
    };
  }

  private adjustStartForSurrogatePair(text: string, position: number): number {
    if (position > 0 && position < text.length) {
      const previous = text.charCodeAt(position - 1);

      const current = text.charCodeAt(position);

      if (isHighSurrogate(previous) && isLowSurrogate(current)) {
        return position + 1;
      }
    }

    return position;
  }

  private adjustEndForSurrogatePair(
    text: string,
    start: number,
    end: number,
  ): number {
    if (end > start && end < text.length) {
      const previous = text.charCodeAt(end - 1);

      const current = text.charCodeAt(end);

      if (isHighSurrogate(previous) && isLowSurrogate(current)) {
        return end - 1;
      }
    }

    return end;
  }

  private validateContextId(contextId: string): void {
    if (typeof contextId !== "string" || !contextId.trim()) {
      throw new Error("Chunker requires a non-empty context ID.");
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw new ContextChunkingAbortedError(signal.reason);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }

  return value;
}

function normalizeNonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }

  return value;
}

function validateMaxIterations(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("maxIterations must be a positive safe integer.");
  }
}

function calculateDefaultMaxIterations(
  textLength: number,
  maxCharacters: number,
  overlap: number,
): number {
  const effectiveStep = Math.max(1, maxCharacters - overlap);

  return Math.ceil(textLength / effectiveStep) * 4 + 100;
}

function findLastBoundary(
  text: string,
  start: number,
  end: number,
  minimum: number,
  predicate: (character: string) => boolean,
): number {
  for (let index = end - 1; index >= minimum; index -= 1) {
    const character = text[index];

    if (character !== undefined && predicate(character)) {
      return index + 1;
    }
  }

  return start;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xd800 && value <= 0xdbff;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xdc00 && value <= 0xdfff;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

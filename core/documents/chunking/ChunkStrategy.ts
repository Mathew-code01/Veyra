// ============================================================================
// FILE: core/documents/chunking/ChunkStrategy.ts
// PURPOSE:
// Defines document-specific chunking strategies.
//
// RESPONSIBILITY:
// NormalizedDocument -> ChunkCandidate[]
//
// DOES NOT:
// - generate embeddings
// - index vectors
// - persist chunks
// - retrieve context
// ============================================================================

import type { DocumentChunkSource, NormalizedDocument } from "../DocumentTypes";

export interface ChunkStrategyOptions {
  readonly maxCharacters: number;

  readonly minCharacters: number;

  readonly overlapCharacters: number;

  readonly signal?: AbortSignal;
}

export interface ChunkCandidate {
  readonly text: string;

  readonly source: DocumentChunkSource;
}

export interface ChunkStrategy {
  readonly name: string;

  createCandidates(
    document: NormalizedDocument,
    options: ChunkStrategyOptions,
  ): readonly ChunkCandidate[];
}

/**
 * Generic strategy cancellation error.
 *
 * Kept inside the document chunking strategy layer rather than coupling
 * strategies directly to DocumentError.
 */
export class ChunkStrategyAbortedError extends Error {
  public readonly cause?: unknown;

  public constructor(cause?: unknown) {
    super("Document chunking strategy was cancelled.");

    this.name = "ChunkStrategyAbortedError";

    this.cause = cause;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }

  throw new ChunkStrategyAbortedError(signal.reason);
}

function findBoundary(
  text: string,
  start: number,
  hardEnd: number,
  minimumRelativePosition: number,
): number {
  const section = text.slice(start, hardEnd);

  const paragraphBreak = section.lastIndexOf("\n\n");

  if (paragraphBreak >= minimumRelativePosition) {
    return start + paragraphBreak + 2;
  }

  const sentenceMarkers = [". ", "? ", "! ", ";\n", "\n"];

  let best = -1;

  for (const marker of sentenceMarkers) {
    const index = section.lastIndexOf(marker);

    if (index >= minimumRelativePosition) {
      best = Math.max(best, index + marker.length);
    }
  }

  if (best >= 0) {
    return start + best;
  }

  for (let index = section.length - 1; index >= 0; index -= 1) {
    if (/\s/u.test(section[index]) && index >= minimumRelativePosition) {
      return start + index + 1;
    }
  }

  return hardEnd;
}

function trimRange(
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

function adjustStartForSurrogatePair(text: string, start: number): number {
  if (start <= 0 || start >= text.length) {
    return start;
  }

  const previous = text.charCodeAt(start - 1);

  const current = text.charCodeAt(start);

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

function adjustEndForSurrogatePair(
  text: string,
  start: number,
  end: number,
): number {
  if (end <= start || end >= text.length) {
    return end;
  }

  const previous = text.charCodeAt(end - 1);

  const next = text.charCodeAt(end);

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

function createTextChunks(
  document: NormalizedDocument,
  options: ChunkStrategyOptions,
): readonly ChunkCandidate[] {
  const text = document.text;

  if (!text.trim()) {
    return [];
  }

  const candidates: ChunkCandidate[] = [];

  let start = 0;

  let iteration = 0;

  const effectiveAdvance = Math.max(
    1,
    options.maxCharacters - options.overlapCharacters,
  );

  const maxIterations = Math.max(
    1000,
    Math.ceil(text.length / effectiveAdvance) * 4,
  );

  if (!Number.isSafeInteger(maxIterations)) {
    throw new RangeError(
      "Chunking iteration limit exceeds the safe integer range.",
    );
  }

  while (start < text.length) {
    throwIfAborted(options.signal);

    iteration += 1;

    if (iteration > maxIterations) {
      throw new Error("Document chunking exceeded the safety iteration limit.");
    }

    start = adjustStartForSurrogatePair(text, start);

    const hardEnd = Math.min(start + options.maxCharacters, text.length);

    let end = hardEnd;

    if (hardEnd < text.length) {
      const minimumRelativePosition = Math.floor(options.maxCharacters * 0.65);

      const boundary = findBoundary(
        text,
        start,
        hardEnd,
        minimumRelativePosition,
      );

      if (boundary > start) {
        end = boundary;
      }
    }

    end = adjustEndForSurrogatePair(text, start, end);

    const range = trimRange(text, start, end);

    if (range.end > range.start) {
      const chunkText = text.slice(range.start, range.end);

      /**
       * Keep a small final remainder.
       *
       * DocumentChunker may apply higher-level policy later,
       * but this strategy must preserve source coverage.
       */
      if (
        chunkText.length >= options.minCharacters ||
        candidates.length === 0
      ) {
        candidates.push({
          text: chunkText,

          source: {
            documentId: document.identity.id,

            startOffset: range.start,

            endOffset: range.end,
          },
        });
      } else {
        /**
         * Merge the final remainder only if doing so will not
         * violate the maximum chunk size.
         */
        const previous = candidates[candidates.length - 1];

        const mergedStart = previous.source.startOffset ?? 0;

        const mergedEnd = range.end;

        const mergedLength = mergedEnd - mergedStart;

        if (mergedLength <= options.maxCharacters) {
          const mergedText = text.slice(mergedStart, mergedEnd).trim();

          candidates[candidates.length - 1] = {
            text: mergedText,

            source: {
              ...previous.source,
              startOffset: mergedStart,
              endOffset: mergedEnd,
            },
          };
        } else {
          candidates.push({
            text: chunkText,

            source: {
              documentId: document.identity.id,

              startOffset: range.start,

              endOffset: range.end,
            },
          });
        }
      }
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = Math.max(start + 1, end - options.overlapCharacters);

    if (nextStart <= start) {
      throw new Error("Document chunking failed to advance the cursor.");
    }

    start = nextStart;
  }

  return candidates;
}

/**
 * Default document strategy.
 *
 * It prefers:
 * 1. paragraph boundaries
 * 2. sentence boundaries
 * 3. whitespace boundaries
 * 4. hard character boundary
 *
 * It preserves exact source offsets for every candidate.
 */
export class StructuralChunkStrategy implements ChunkStrategy {
  public readonly name = "structural";

  public createCandidates(
    document: NormalizedDocument,
    options: ChunkStrategyOptions,
  ): readonly ChunkCandidate[] {
    return createTextChunks(document, options);
  }
}

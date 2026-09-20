// ============================================================================
// FILE: core/documents/chunking/ChunkStrategy.ts
// PURPOSE:
// Defines pluggable document chunking strategies.
//
// A strategy decides WHERE chunks should be split.
// DocumentChunker owns validation, orchestration and provenance.
// ============================================================================

import type {
  DocumentChunk,
  DocumentChunkSource,
  NormalizedDocument,
} from "../DocumentTypes";

export interface ChunkStrategyOptions {
  readonly maxCharacters: number;
  readonly minCharacters: number;
  readonly overlapCharacters: number;
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

function findBoundary(
  text: string,
  start: number,
  hardEnd: number,
  minimumRelativePosition: number,
): number {
  const section = text.slice(start, hardEnd);

  const paragraphBreak = section.lastIndexOf("\n\n");

  if (paragraphBreak >= minimumRelativePosition) {
    return start + paragraphBreak;
  }

  const sentenceMarkers = [". ", "? ", "! ", ";\n", "\n"];

  let best = -1;

  for (const marker of sentenceMarkers) {
    const index = section.lastIndexOf(marker);

    if (index >= minimumRelativePosition) {
      best = Math.max(best, index + marker.length);
    }
  }

  return best >= 0 ? start + best : hardEnd;
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

  while (start < text.length) {
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

    const rawText = text.slice(start, end);
    const chunkText = rawText.trim();

    if (chunkText.length >= options.minCharacters || candidates.length === 0) {
      candidates.push({
        text: chunkText,
        source: {
          documentId: document.identity.id,
          startOffset: start,
          endOffset: end,
        },
      });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = Math.max(start + 1, end - options.overlapCharacters);

    start = nextStart;
  }

  return candidates;
}

/**
 * General-purpose structural/text strategy.
 *
 * This is intentionally conservative.
 * More advanced semantic strategies can be added later without
 * changing DocumentChunker.
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

// core/context/Chunker.ts

export interface ChunkMetadata {
  readonly documentId: string;
  readonly documentName?: string;
  readonly type?: string;
  readonly candidateId?: string;
  readonly source?: string;
  readonly chunkIndex: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly [key: string]: unknown;
}

export interface Chunk {
  readonly id: string;
  readonly documentId: string;
  readonly text: string;
  readonly metadata: ChunkMetadata;
}

export interface ChunkOptions {
  readonly maxCharacters?: number;
  readonly overlapCharacters?: number;
  readonly minCharacters?: number;
  readonly [key: string]: unknown;
}

export interface Chunker {
  chunk(
    documentId: string,
    text: string,
    metadata?: Record<string, unknown>,
    options?: ChunkOptions,
  ): readonly Chunk[];
}

const DEFAULT_MAX_CHARACTERS = 1200;
const DEFAULT_OVERLAP = 180;
const DEFAULT_MIN_CHARACTERS = 40;

function createChunkId(documentId: string, index: number): string {
  return `${documentId}:chunk:${index}`;
}

export class DefaultChunker implements Chunker {
  public chunk(
    documentId: string,
    text: string,
    metadata: Record<string, unknown> = {},
    options: ChunkOptions = {},
  ): readonly Chunk[] {
    const maxCharacters = Math.max(
      200,
      options.maxCharacters ?? DEFAULT_MAX_CHARACTERS,
    );

    const overlapCharacters = Math.min(
      Math.max(0, options.overlapCharacters ?? DEFAULT_OVERLAP),
      Math.floor(maxCharacters / 2),
    );

    const minCharacters = Math.max(
      1,
      options.minCharacters ?? DEFAULT_MIN_CHARACTERS,
    );

    const normalized = this.normalize(text);

    if (!normalized) {
      return [];
    }

    const chunks: Chunk[] = [];

    let start = 0;
    let chunkIndex = 0;

    while (start < normalized.length) {
      const hardEnd = Math.min(start + maxCharacters, normalized.length);

      let end = hardEnd;

      if (hardEnd < normalized.length) {
        const boundary = this.findBoundary(
          normalized,
          start,
          hardEnd,
          Math.floor(maxCharacters * 0.65),
        );

        if (boundary > start) {
          end = boundary;
        }
      }

      const chunkText = normalized.slice(start, end).trim();

      if (chunkText.length >= minCharacters || chunks.length === 0) {
        chunks.push({
          id: createChunkId(documentId, chunkIndex),
          documentId,
          text: chunkText,
          metadata: {
            ...metadata,
            documentId,
            chunkIndex,
            startOffset: start,
            endOffset: end,
          },
        });

        chunkIndex += 1;
      }

      if (end >= normalized.length) {
        break;
      }

      const nextStart = Math.max(start + 1, end - overlapCharacters);

      start = nextStart;
    }

    return chunks;
  }

  private normalize(text: string): string {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private findBoundary(
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

    const sentenceBreaks = [". ", "? ", "! ", ";\n", "\n"];

    let best = -1;

    for (const marker of sentenceBreaks) {
      const index = section.lastIndexOf(marker);

      if (index >= minimumRelativePosition) {
        best = Math.max(best, index + marker.length);
      }
    }

    return best >= 0 ? start + best : hardEnd;
  }
}
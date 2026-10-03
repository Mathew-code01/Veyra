// ============================================================================
// FILE: core/context/embeddings/EmbeddingService.ts
//
// PURPOSE:
// Generic embedding abstraction for Context.
//
// Context does not care whether embeddings come from:
// - local model
// - cloud model
// - ONNX
// - llama.cpp
// - another embedding provider
//
// The implementation is injected.
// ============================================================================

export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];

  readonly dimensions: number;

  readonly model?: string;
}

export interface EmbeddingService {
  embed(
    texts: readonly string[],
    options?: {
      readonly signal?: AbortSignal;
    },
  ): Promise<EmbeddingResult>;

  embedOne(
    text: string,
    options?: {
      readonly signal?: AbortSignal;
    },
  ): Promise<readonly number[]>;
}

// ============================================================================
// DEVELOPMENT IMPLEMENTATION
// ============================================================================

/**
 * Deterministic development embedding implementation.
 *
 * This is NOT intended to provide production semantic quality.
 *
 * It exists so Context can be composed/tested without requiring an
 * external embedding provider.
 */
export class MockEmbeddingService implements EmbeddingService {
  public constructor(private readonly dimensions = 384) {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
      throw new RangeError(
        "Embedding dimensions must be a positive safe integer.",
      );
    }
  }

  public async embed(
    texts: readonly string[],
    options: {
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<EmbeddingResult> {
    if (!Array.isArray(texts)) {
      throw new TypeError("Embedding input must be an array.");
    }

    const embeddings: readonly number[][] = texts.map((text) => {
      this.throwIfAborted(options.signal);

      if (typeof text !== "string") {
        throw new TypeError("Embedding text must be a string.");
      }

      return this.createEmbedding(text);
    });

    this.throwIfAborted(options.signal);

    return {
      embeddings,

      dimensions: this.dimensions,

      model: "mock-embedding",
    };
  }

  public async embedOne(
    text: string,
    options: {
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<readonly number[]> {
    const result = await this.embed([text], options);

    const embedding = result.embeddings[0];

    if (!embedding) {
      throw new Error("Embedding service returned no embedding.");
    }

    return embedding;
  }

  private createEmbedding(text: string): readonly number[] {
    const vector = new Array<number>(this.dimensions).fill(0);

    if (!text) {
      return vector;
    }

    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);

      const position = Math.abs((code * 31 + index * 17) % this.dimensions);

      vector[position] += ((code % 13) + 1) / 13;
    }

    let magnitude = 0;

    for (const value of vector) {
      magnitude += value * value;
    }

    magnitude = Math.sqrt(magnitude);

    if (magnitude === 0) {
      return vector;
    }

    return vector.map((value) => value / magnitude);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Embedding operation was cancelled.");
  }
}

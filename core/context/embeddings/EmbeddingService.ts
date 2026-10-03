// ============================================================================
// FILE: core/context/embeddings/EmbeddingService.ts
//
// PURPOSE:
// Generic embedding abstraction for Veyra Context.
//
// ARCHITECTURAL RULE:
// This service is source-agnostic.
//
// It does not know about:
// - documents
// - vision
// - audio
// - conversation
// - candidate
// - interview
//
// It only converts text into embedding vectors.
//
// Embeddings are immutable values at the Context boundary.
// ============================================================================

// ============================================================================
// OPTIONS
// ============================================================================

export interface EmbeddingOptions {
  /**
   * Optional cancellation signal.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// RESULT
// ============================================================================

/**
 * Result returned by an embedding provider.
 *
 * The outer array corresponds to the supplied texts.
 *
 * Each individual embedding vector is readonly because callers should not
 * mutate provider-generated vectors after creation.
 */
export interface EmbeddingResult {
  readonly embeddings: readonly (readonly number[])[];

  /**
   * Provider/model identifier used to generate the embeddings.
   */
  readonly model: string;

  /**
   * Vector dimensionality.
   */
  readonly dimensions: number;
}

// ============================================================================
// SERVICE
// ============================================================================

export interface EmbeddingService {
  /**
   * Generate embeddings for multiple texts.
   *
   * The result order MUST match the input order.
   */
  embed(
    texts: readonly string[],
    options?: EmbeddingOptions,
  ): Promise<EmbeddingResult>;

  /**
   * Generate one embedding vector.
   */
  embedOne(
    text: string,
    options?: EmbeddingOptions,
  ): Promise<readonly number[]>;
}

// ============================================================================
// MOCK IMPLEMENTATION
// ============================================================================

/**
 * Deterministic development/test embedding implementation.
 *
 * IMPORTANT:
 * This is a development implementation.
 *
 * It exists so the Context pipeline can be exercised without requiring
 * an external embedding provider.
 *
 * Production deployments should replace it with a real embedding service.
 */
export class MockEmbeddingService implements EmbeddingService {
  public readonly model: string;

  public readonly dimensions: number;

  public constructor(dimensions = 384, model = "mock-embedding") {
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
      throw new RangeError(
        "Embedding dimensions must be a positive safe integer.",
      );
    }

    if (typeof model !== "string" || !model.trim()) {
      throw new Error("Embedding model must be a non-empty string.");
    }

    this.dimensions = dimensions;

    this.model = model.trim();
  }

  public async embed(
    texts: readonly string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResult> {
    this.throwIfAborted(options.signal);

    if (!Array.isArray(texts)) {
      throw new TypeError("Embedding input must be an array of strings.");
    }

    const embeddings: Array<readonly number[]> = [];

    for (let index = 0; index < texts.length; index += 1) {
      this.throwIfAborted(options.signal);

      const text = texts[index];

      if (typeof text !== "string") {
        throw new TypeError(
          `Embedding input at index ${index} must be a string.`,
        );
      }

      embeddings.push(await this.embedOne(text, options));
    }

    return {
      embeddings,

      model: this.model,

      dimensions: this.dimensions,
    };
  }

  public async embedOne(
    text: string,
    options: EmbeddingOptions = {},
  ): Promise<readonly number[]> {
    this.throwIfAborted(options.signal);

    if (typeof text !== "string") {
      throw new TypeError("Embedding text must be a string.");
    }

    /**
     * Deterministic normalized representation.
     *
     * The mock embedding is intentionally simple and is NOT intended to
     * provide meaningful semantic similarity.
     */
    const normalized = text.trim();

    const vector = new Array<number>(this.dimensions).fill(0);

    if (!normalized) {
      return vector;
    }

    /**
     * Lightweight deterministic hashing.
     *
     * Multiple passes distribute stable values across the requested
     * dimensionality.
     */
    let seed = 2166136261;

    for (let index = 0; index < normalized.length; index += 1) {
      seed ^= normalized.charCodeAt(index);

      seed = Math.imul(seed, 16777619);
    }

    for (let index = 0; index < this.dimensions; index += 1) {
      this.throwIfAborted(options.signal);

      seed = Math.imul(seed ^ (index + 1), 16777619);

      const unsigned = seed >>> 0;

      vector[index] = (unsigned / 4294967295) * 2 - 1;
    }

    return vector;
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

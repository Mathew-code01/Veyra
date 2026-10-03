// ============================================================================
// FILE: core/context/storage/VectorStore.ts
//
// PURPOSE:
// Generic vector storage abstraction.
//
// IMPORTANT:
// There is intentionally NO documentId requirement here.
//
// A document is only one possible source of Context.
//
// The store therefore operates on:
// - contextId
// - sourceType
// - sourceId
// - contentType
// - scope
// - generic metadata
// ============================================================================

import type {
  ContextContentType,
  ContextScope,
  ContextSourceType,
} from "../contracts/ContextTypes";

import type {
  ContextStore,
  ContextVectorRecord,
  ContextVectorSearchOptions,
  ContextVectorSearchResult,
} from "../contracts/ContextStore";

// ============================================================================
// PUBLIC TYPES
// ============================================================================

export type {
  ContextVectorRecord,
  ContextVectorSearchOptions,
  ContextVectorSearchResult,
  ContextStore,
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

export class InMemoryVectorStore implements ContextStore {
  private readonly records = new Map<string, ContextVectorRecord>();

  public async upsert(records: readonly ContextVectorRecord[]): Promise<void> {
    if (!Array.isArray(records)) {
      throw new TypeError("Vector records must be an array.");
    }

    for (const record of records) {
      this.validateRecord(record);

      this.records.set(record.id, record);
    }
  }

  public async deleteByContext(contextId: string): Promise<void> {
    const normalized = contextId?.trim();

    if (!normalized) {
      throw new Error("A context ID is required.");
    }

    for (const [id, record] of this.records) {
      if (record.contextId === normalized) {
        this.records.delete(id);
      }
    }
  }

  public async search(
    vector: readonly number[],
    options: ContextVectorSearchOptions,
  ): Promise<readonly ContextVectorSearchResult[]> {
    this.validateVector(vector);

    if (!options) {
      throw new Error("Vector search options are required.");
    }

    this.throwIfAborted(options.signal);

    const results: ContextVectorSearchResult[] = [];

    for (const record of this.records.values()) {
      this.throwIfAborted(options.signal);

      if (record.vector.length !== vector.length) {
        continue;
      }

      if (!matchesFilters(record, options)) {
        continue;
      }

      const score = cosineSimilarity(vector, record.vector);

      if (score < options.minScore) {
        continue;
      }

      results.push({
        record,

        score,
      });
    }

    results.sort((left, right) => right.score - left.score);

    return results.slice(0, options.limit);
  }

  public async count(): Promise<number> {
    return this.records.size;
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }

  private validateRecord(record: ContextVectorRecord): void {
    if (!record) {
      throw new Error("Vector record is required.");
    }

    if (!record.id?.trim()) {
      throw new Error("Vector record requires an ID.");
    }

    if (!record.contextId?.trim()) {
      throw new Error(`Vector record "${record.id}" requires a contextId.`);
    }

    if (typeof record.text !== "string") {
      throw new Error(`Vector record "${record.id}" requires text.`);
    }

    this.validateVector(record.vector);

    if (!record.sourceType) {
      throw new Error(`Vector record "${record.id}" requires sourceType.`);
    }

    if (!record.contentType) {
      throw new Error(`Vector record "${record.id}" requires contentType.`);
    }
  }

  private validateVector(vector: readonly number[]): void {
    if (!Array.isArray(vector)) {
      throw new TypeError("Vector must be an array.");
    }

    if (vector.length === 0) {
      throw new Error("Vector must not be empty.");
    }

    for (const value of vector) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Vector contains an invalid numeric value.");
      }
    }
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Vector search was cancelled.");
  }
}

// ============================================================================
// FILTERING
// ============================================================================

function matchesFilters(
  record: ContextVectorRecord,
  options: ContextVectorSearchOptions,
): boolean {
  if (
    options.sourceTypes &&
    options.sourceTypes.length > 0 &&
    !options.sourceTypes.includes(record.sourceType)
  ) {
    return false;
  }

  if (
    options.contentTypes &&
    options.contentTypes.length > 0 &&
    !options.contentTypes.includes(record.contentType)
  ) {
    return false;
  }

  if (options.sourceIds && options.sourceIds.length > 0) {
    const sourceId = record.sourceId;

    if (!sourceId || !options.sourceIds.includes(sourceId)) {
      return false;
    }
  }

  if (options.scope && !matchesScope(record.scope, options.scope)) {
    return false;
  }

  if (options.metadata && !matchesMetadata(record.metadata, options.metadata)) {
    return false;
  }

  return true;
}

function matchesScope(
  actual: ContextScope | undefined,
  requested: ContextScope,
): boolean {
  if (!actual) {
    return false;
  }

  for (const [key, value] of Object.entries(requested)) {
    if (actual[key] !== value) {
      return false;
    }
  }

  return true;
}

function matchesMetadata(
  actual: Readonly<Record<string, unknown>>,
  requested: Readonly<Record<string, unknown>>,
): boolean {
  for (const [key, value] of Object.entries(requested)) {
    if (actual[key] !== value) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// VECTOR MATH
// ============================================================================

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length) {
    return 0;
  }

  let dot = 0;

  let leftMagnitude = 0;

  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;

    const rightValue = right[index] ?? 0;

    dot += leftValue * rightValue;

    leftMagnitude += leftValue * leftValue;

    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

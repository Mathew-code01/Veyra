// core/context/VectorStore.ts

export interface VectorRecordMetadata {
  readonly documentId: string;
  readonly type?: string;
  readonly candidateId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}

export interface VectorRecord {
  readonly id: string;
  readonly vector: readonly number[];
  readonly text: string;
  readonly documentId: string;
  readonly metadata: VectorRecordMetadata;
}

export interface VectorSearchOptions {
  readonly limit?: number;
  readonly minScore?: number;
  readonly documentIds?: readonly string[];
  readonly documentTypes?: readonly string[];
  readonly candidateId?: string;
}

export interface VectorSearchResult {
  readonly record: VectorRecord;
  readonly score: number;
}

export interface VectorStore {
  upsert(records: readonly VectorRecord[]): Promise<void>;

  deleteByDocument(documentId: string): Promise<void>;

  search(
    vector: readonly number[],
    options?: VectorSearchOptions,
  ): Promise<readonly VectorSearchResult[]>;

  count(): Promise<number>;

  clear(): Promise<void>;
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;

    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  public async upsert(records: readonly VectorRecord[]): Promise<void> {
    for (const record of records) {
      this.validateRecord(record);
      this.records.set(record.id, {
        ...record,
        vector: [...record.vector],
      });
    }
  }

  public async deleteByDocument(documentId: string): Promise<void> {
    for (const [id, record] of this.records.entries()) {
      if (record.documentId === documentId) {
        this.records.delete(id);
      }
    }
  }

  public async search(
    vector: readonly number[],
    options: VectorSearchOptions = {},
  ): Promise<readonly VectorSearchResult[]> {
    const limit = Math.max(1, options.limit ?? 8);
    const minScore = options.minScore ?? -1;

    const documentIds = options.documentIds
      ? new Set(options.documentIds)
      : undefined;

    const documentTypes = options.documentTypes
      ? new Set(options.documentTypes)
      : undefined;

    const results: VectorSearchResult[] = [];

    for (const record of this.records.values()) {
      if (documentIds && !documentIds.has(record.documentId)) {
        continue;
      }

      if (
        documentTypes &&
        record.metadata.type &&
        !documentTypes.has(record.metadata.type)
      ) {
        continue;
      }

      if (
        options.candidateId &&
        record.metadata.candidateId !== options.candidateId
      ) {
        continue;
      }

      const score = cosineSimilarity(vector, record.vector);

      if (score >= minScore) {
        results.push({
          record,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
  }

  public async count(): Promise<number> {
    return this.records.size;
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }

  private validateRecord(record: VectorRecord): void {
    if (!record.id.trim()) {
      throw new Error("Vector record id is required.");
    }

    if (!record.documentId.trim()) {
      throw new Error("Vector record documentId is required.");
    }

    if (!record.text.trim()) {
      throw new Error(`Vector record "${record.id}" contains empty text.`);
    }

    if (record.vector.length === 0) {
      throw new Error(`Vector record "${record.id}" contains an empty vector.`);
    }

    if (record.vector.some((value) => !Number.isFinite(value))) {
      throw new Error(
        `Vector record "${record.id}" contains an invalid vector.`,
      );
    }
  }
}
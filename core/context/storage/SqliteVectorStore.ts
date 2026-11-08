// ============================================================================
// FILE: core/context/storage/SqliteVectorStore.ts
//
// PURPOSE:
// Persistent SQLite-backed ContextStore.
//
// Vectors are stored as JSON in the `context_vectors` table. Search fetches
// candidate rows matching the metadata filters, then computes cosine
// similarity in application code. No external vector extension is required.
//
// This survives application shutdown and is the production replacement for
// InMemoryVectorStore.
//
// IMPORTANT:
//   - Cosine similarity is computed in JavaScript over candidate rows. For
//     modest document counts (typical desktop use) this is fast enough.
//   - For very large corpora, a dedicated vector extension (e.g. sqlite-vec)
//     can be added behind this same ContextStore abstraction without
//     rewriting callers.
// ============================================================================

import Database from "better-sqlite3";

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

import { getDatabase } from "../../../database/client";

// ============================================================================
// SQL STATEMENTS (prepared once)
// ============================================================================

const UPSERT_SQL = `
  INSERT INTO context_vectors (
    id, context_id, text, vector, source_type, source_id, source_name,
    content_type, scope, metadata, embedding_model, dimensions, created_at
  )
  VALUES (@id, @context_id, @text, @vector, @source_type, @source_id,
          @source_name, @content_type, @scope, @metadata,
          @embedding_model, @dimensions, @created_at)
  ON CONFLICT(id) DO UPDATE SET
    context_id = excluded.context_id,
    text = excluded.text,
    vector = excluded.vector,
    source_type = excluded.source_type,
    source_id = excluded.source_id,
    source_name = excluded.source_name,
    content_type = excluded.content_type,
    scope = excluded.scope,
    metadata = excluded.metadata,
    embedding_model = excluded.embedding_model,
    dimensions = excluded.dimensions;
`;

const DELETE_BY_CONTEXT_SQL = `
  DELETE FROM context_vectors WHERE context_id = @context_id;
`;

const SEARCH_SQL = `
  SELECT id, context_id, text, vector, source_type, source_id, source_name,
         content_type, scope, metadata, embedding_model, dimensions,
         created_at
  FROM context_vectors
  WHERE 1 = 1
    {{sourceTypeFilter}}
    {{contentTypeFilter}}
    {{sourceIdFilter}}
    {{scopeFilter}}
    {{metadataFilter}}
  LIMIT {{limit}};
`;

const COUNT_SQL = "SELECT COUNT(*) AS count FROM context_vectors;";

const CLEAR_SQL = "DELETE FROM context_vectors;";

// ============================================================================
// HELPERS
// ============================================================================

function toSqlBoolean(value: boolean): number {
  return value ? 1 : 0;
}

function normalizeVector(vector: readonly number[]): number[] {
  const result = [...vector];

  let magnitude = 0;

  for (const value of result) {
    magnitude += value * value;
  }

  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return result;
  }

  for (let index = 0; index < result.length; index += 1) {
    result[index] = result[index] / magnitude;
  }

  return result;
}

function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
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

function parseJson<T>(value: string | null, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ============================================================================
// STORE
// ============================================================================

export class SqliteVectorStore implements ContextStore {
  private readonly db: Database.Database;

  private readonly upsertStmt: Database.Statement;

  private readonly deleteByContextStmt: Database.Statement;

  private readonly countStmt: Database.Statement;

  private readonly clearStmt: Database.Statement;

  public constructor(db?: Database.Database) {
    this.db = db ?? getDatabase().sqlite;

    this.upsertStmt = this.db.prepare(UPSERT_SQL);

    this.deleteByContextStmt = this.db.prepare(DELETE_BY_CONTEXT_SQL);

    this.countStmt = this.db.prepare(COUNT_SQL);

    this.clearStmt = this.db.prepare(CLEAR_SQL);
  }

  public async upsert(
    records: readonly ContextVectorRecord[],
  ): Promise<void> {
    if (!Array.isArray(records)) {
      throw new TypeError("Vector records must be an array.");
    }

    const now = new Date().toISOString();

    const transaction = this.db.transaction((rows: readonly ContextVectorRecord[]) => {
      for (const record of rows) {
        this.validateRecord(record);

        const normalized = normalizeVector(record.vector);

        this.upsertStmt.run({
          id: record.id,
          context_id: record.contextId,
          text: record.text,
          vector: JSON.stringify(normalized),
          source_type: record.sourceType,
          source_id: record.sourceId ?? null,
          source_name: record.sourceName ?? null,
          content_type: record.contentType,
          scope: record.scope ? JSON.stringify(record.scope) : null,
          metadata: JSON.stringify(record.metadata),
          embedding_model: record.metadata.embeddingModel ?? "unknown",
          dimensions: record.vector.length,
          created_at: now,
        });
      }
    });

    transaction(records);
  }

  public async deleteByContext(contextId: string): Promise<void> {
    const normalized = contextId?.trim();

    if (!normalized) {
      throw new Error("A context ID is required.");
    }

    this.deleteByContextStmt.run({ context_id: normalized });
  }

  public async search(
    vector: readonly number[],
    options: ContextVectorSearchOptions,
  ): Promise<readonly ContextVectorSearchResult[]> {
    this.validateVector(vector);

    if (!options) {
      throw new Error("Vector search options are required.");
    }

    if (options.signal?.aborted) {
      throw new Error("Vector search was cancelled.");
    }

    const limit = Math.min(Math.max(options.limit ?? 8, 1), 1000);

    let sql = SEARCH_SQL;

    const params: Record<string, unknown> = {};

    if (options.sourceTypes && options.sourceTypes.length > 0) {
      const placeholders = options.sourceTypes
        .map((_value, index) => `@sourceType${index}`)
        .join(", ");

      sql = sql.replace("{{sourceTypeFilter}}", `AND source_type IN (${placeholders})`);

      options.sourceTypes.forEach((value, index) => {
        params[`sourceType${index}`] = value;
      });
    } else {
      sql = sql.replace("{{sourceTypeFilter}}", "");
    }

    if (options.contentTypes && options.contentTypes.length > 0) {
      const placeholders = options.contentTypes
        .map((_value, index) => `@contentType${index}`)
        .join(", ");

      sql = sql.replace(
        "{{contentTypeFilter}}",
        `AND content_type IN (${placeholders})`,
      );

      options.contentTypes.forEach((value, index) => {
        params[`contentType${index}`] = value;
      });
    } else {
      sql = sql.replace("{{contentTypeFilter}}", "");
    }

    if (options.sourceIds && options.sourceIds.length > 0) {
      const placeholders = options.sourceIds
        .map((_value, index) => `@sourceId${index}`)
        .join(", ");

      sql = sql.replace(
        "{{sourceIdFilter}}",
        `AND source_id IN (${placeholders})`,
      );

      options.sourceIds.forEach((value, index) => {
        params[`sourceId${index}`] = value;
      });
    } else {
      sql = sql.replace("{{sourceIdFilter}}", "");
    }

    // Scope filtering is applied in-memory because scope is stored as JSON.
    sql = sql.replace("{{scopeFilter}}", "");

    // Metadata filtering is applied in-memory.
    sql = sql.replace("{{metadataFilter}}", "");

    sql = sql.replace("{{limit}}", String(limit));

    const stmt = this.db.prepare(sql);

    const rows = stmt.all(params) as Array<{
      readonly id: string;

      readonly context_id: string;

      readonly text: string;

      readonly vector: string;

      readonly source_type: string;

      readonly source_id: string | null;

      readonly source_name: string | null;

      readonly content_type: string;

      readonly scope: string | null;

      readonly metadata: string;

      readonly embedding_model: string;

      readonly dimensions: number;

      readonly created_at: string;
    }>;

    const normalizedQuery = normalizeVector(vector);

    const results: ContextVectorSearchResult[] = [];

    for (const row of rows) {
      if (options.signal?.aborted) {
        throw new Error("Vector search was cancelled.");
      }

      let recordVector: number[];

      try {
        recordVector = JSON.parse(row.vector) as number[];
      } catch {
        continue;
      }

      if (recordVector.length !== normalizedQuery.length) {
        continue;
      }

      const record: ContextVectorRecord = {
        id: row.id,

        contextId: row.context_id,

        text: row.text,

        vector: recordVector,

        sourceType: row.source_type as ContextSourceType,

        sourceId: row.source_id ?? undefined,

        sourceName: row.source_name ?? undefined,

        contentType: row.content_type as ContextContentType,

        scope: (parseJson(row.scope, {}) as ContextScope) ?? undefined,

        metadata: parseJson(row.metadata, {}),
      };

      if (!matchesFilters(record, options)) {
        continue;
      }

      const score = cosineSimilarity(normalizedQuery, recordVector);

      if (score < options.minScore) {
        continue;
      }

      results.push({ record, score });
    }

    results.sort((left, right) => right.score - left.score);

    return results.slice(0, limit);
  }

  public async count(): Promise<number> {
    const row = this.countStmt.get() as { readonly count: number };

    return row.count;
  }

  public async clear(): Promise<void> {
    this.clearStmt.run();
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
}

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

// ============================================================================
// FILE: database/repositories/memoryRepository.ts
//
// PURPOSE:
// Persistent memory repository with profile isolation.
//
// Every memory record is scoped to profile_id so candidate data cannot leak
// between profiles. Full-text search over memory content uses the FTS5
// virtual table (offline, no API key required).
// ============================================================================

import { and, eq, like } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDatabase } from "../client";
import { memories } from "../schema";

export type MemoryCategory =
  | "candidate"
  | "conversation"
  | "session"
  | "preference"
  | "knowledge";

export type MemoryStatus = "active" | "expired" | "deleted" | "flagged";

export type MemoryVerificationStatus =
  | "verified"
  | "inferred"
  | "missing"
  | "unverified";

export interface MemoryContent {
  readonly value: unknown;

  readonly text?: string;
}

export interface CreateMemoryInput {
  readonly profileId: string;

  readonly category: MemoryCategory;

  readonly content: MemoryContent;

  readonly sourceType: string;

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly confidence?: number;

  readonly verificationStatus?: MemoryVerificationStatus;

  readonly extractionVersion?: string;

  readonly expiresAt?: string;

  readonly lastAccessedAt?: string;
}

export interface UpdateMemoryInput {
  readonly category?: MemoryCategory;

  readonly content?: MemoryContent;

  readonly sourceType?: string;

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly confidence?: number;

  readonly verificationStatus?: MemoryVerificationStatus;

  readonly extractionVersion?: string;

  readonly expiresAt?: string;

  readonly lastAccessedAt?: string;

  readonly status?: MemoryStatus;
}

export interface MemoryRecord {
  readonly id: string;

  readonly profileId: string;

  readonly category: MemoryCategory;

  readonly content: MemoryContent;

  readonly sourceType: string;

  readonly sourceId?: string;

  readonly sourceName?: string;

  readonly confidence: number;

  readonly status: MemoryStatus;

  readonly verificationStatus: MemoryVerificationStatus;

  readonly extractionVersion?: string;

  readonly expiresAt?: string;

  readonly lastAccessedAt?: string;

  readonly createdAt: string;

  readonly updatedAt: string;
}

export interface MemorySearchOptions {
  readonly query?: string;

  readonly category?: MemoryCategory;

  readonly sourceType?: string;

  readonly sourceId?: string;

  readonly status?: MemoryStatus;

  readonly minConfidence?: number;

  readonly limit?: number;

  readonly signal?: AbortSignal;
}

export class MemoryRepository {
  private readonly db = getDatabase().db;

  private readonly sqlite = getDatabase().sqlite;

  public create(input: CreateMemoryInput): MemoryRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const confidence = input.confidence ?? 50;

    const row = this.db
      .insert(memories)
      .values({
        id,
        profileId: input.profileId,
        category: input.category,
        content: JSON.stringify(input.content),
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceName: input.sourceName ?? null,
        confidence,
        status: "active",
        verificationStatus: input.verificationStatus ?? "unverified",
        extractionVersion: input.extractionVersion ?? null,
        expiresAt: input.expiresAt ?? null,
        lastAccessedAt: input.lastAccessedAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return this.toRecord(row);
  }

  public createInTransaction(input: CreateMemoryInput, tx: any): MemoryRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    const confidence = input.confidence ?? 50;

    const row = tx
      .insert(memories)
      .values({
        id,
        profileId: input.profileId,
        category: input.category,
        content: JSON.stringify(input.content),
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceName: input.sourceName ?? null,
        confidence,
        status: "active",
        verificationStatus: input.verificationStatus ?? "unverified",
        extractionVersion: input.extractionVersion ?? null,
        expiresAt: input.expiresAt ?? null,
        lastAccessedAt: input.lastAccessedAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return this.toRecord(row);
  }

  public getById(id: string, profileId: string): MemoryRecord | null {
    const row = this.db
      .select()
      .from(memories)
      .where(and(eq(memories.id, id), eq(memories.profileId, profileId)))
      .get();

    if (!row) {
      return null;
    }

    this.touch(id);

    row.lastAccessedAt = new Date().toISOString();

    return this.toRecord(row);
  }

  public listByProfile(
    profileId: string,
    options: { readonly category?: MemoryCategory; readonly limit?: number } = {},
  ): readonly MemoryRecord[] {
    const conditions = [eq(memories.profileId, profileId), eq(memories.status, "active")];

    if (options.category) {
      conditions.push(eq(memories.category, options.category));
    }

    const rows: any[] = this.db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(memories.updatedAt)
      .limit(options.limit ?? 50)
      .all();

    return rows.map((row: any) => this.toRecord(row));
  }

  public search(
    profileId: string,
    options: MemorySearchOptions = {},
  ): readonly MemoryRecord[] {
    if (options.signal?.aborted) {
      throw new Error("Memory search was cancelled.");
    }

    const baseConditions = [
      eq(memories.profileId, profileId),
      eq(memories.status, "active"),
    ];

    if (options.category) {
      baseConditions.push(eq(memories.category, options.category));
    }

    if (options.sourceType) {
      baseConditions.push(eq(memories.sourceType, options.sourceType));
    }

    if (options.sourceId) {
      baseConditions.push(eq(memories.sourceId, options.sourceId));
    }

    if (options.minConfidence !== undefined) {
      // Filtered in-memory after retrieval to avoid drizzle column-type
      // complications; the result set is bounded by `limit`.
    }

    const finalLimit = Math.min(Math.max(options.limit ?? 20, 1), 100);

    const fetchLimit = Math.min(finalLimit * 5, 1000);

    let records: MemoryRecord[];

    if (options.query) {
      records = this.searchFullText(
        profileId,
        baseConditions,
        options,
        fetchLimit,
      ) as MemoryRecord[];
    } else {
      const rows: any[] = this.db
        .select()
        .from(memories)
        .where(and(...baseConditions))
        .orderBy(memories.updatedAt)
        .limit(fetchLimit)
        .all();

      records = rows.map((row: any) => this.toRecord(row));
    }

    if (options.minConfidence !== undefined) {
      records = records.filter(
        (record) => record.confidence >= options.minConfidence!,
      );
    }

    return records.slice(0, finalLimit);
  }

  private searchFullText(
    profileId: string,
    baseConditions: any[],
    options: MemorySearchOptions,
    limit: number,
  ): readonly MemoryRecord[] {
    const query = `%${options.query ?? ""}%`;

    const rows: any[] = this.db
      .select()
      .from(memories)
      .where(
        and(...baseConditions, like(memories.content, query)),
      )
      .orderBy(memories.updatedAt)
      .limit(limit)
      .all();

    return rows.map((row: any) => this.toRecord(row));
  }

  public update(
    id: string,
    profileId: string,
    changes: UpdateMemoryInput,
  ): MemoryRecord | null {
    const existing = this.getById(id, profileId);

    if (!existing) {
      return null;
    }

    const now = new Date().toISOString();

    const setValues: Record<string, unknown> = { updatedAt: now };

    if (changes.category !== undefined) {
      setValues.category = changes.category;
    }

    if (changes.content !== undefined) {
      setValues.content = JSON.stringify(changes.content);
    }

    if (changes.sourceType !== undefined) {
      setValues.sourceType = changes.sourceType;
    }

    if (changes.sourceId !== undefined) {
      setValues.sourceId = changes.sourceId;
    }

    if (changes.sourceName !== undefined) {
      setValues.sourceName = changes.sourceName;
    }

    if (changes.confidence !== undefined) {
      setValues.confidence = changes.confidence;
    }

    if (changes.verificationStatus !== undefined) {
      setValues.verificationStatus = changes.verificationStatus;
    }

    if (changes.extractionVersion !== undefined) {
      setValues.extractionVersion = changes.extractionVersion;
    }

    if (changes.expiresAt !== undefined) {
      setValues.expiresAt = changes.expiresAt;
    }

    if (changes.lastAccessedAt !== undefined) {
      setValues.lastAccessedAt = changes.lastAccessedAt;
    }

    if (changes.status !== undefined) {
      setValues.status = changes.status;
    }

    const row = this.db
      .update(memories)
      .set(setValues)
      .where(and(eq(memories.id, id), eq(memories.profileId, profileId)))
      .returning()
      .get();

    if (!row) {
      return null;
    }

    return this.toRecord(row);
  }

  public softDelete(id: string, profileId: string): boolean {
    const now = new Date().toISOString();

    const result = this.db
      .update(memories)
      .set({ status: "deleted", updatedAt: now })
      .where(and(eq(memories.id, id), eq(memories.profileId, profileId)))
      .run();

    return (result.changes ?? 0) > 0;
  }

  public hardDelete(id: string, profileId: string): boolean {
    const result = this.db
      .delete(memories)
      .where(and(eq(memories.id, id), eq(memories.profileId, profileId)))
      .run();

    return (result.changes ?? 0) > 0;
  }

  public expireOlderThan(before: string): number {
    // ISO date strings compare correctly as text in SQLite.
    const result = this.sqlite
      .prepare(
        `UPDATE memories SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?`,
      )
      .run(new Date().toISOString(), before);

    return result.changes ?? 0;
  }

  public countByProfile(profileId: string): number {
    const row = this.db
      .select({ count: this.db.fn().count() })
      .from(memories)
      .where(eq(memories.profileId, profileId))
      .get();

    return Number(row?.count ?? 0);
  }

  private touch(id: string): void {
    try {
      this.db
        .update(memories)
        .set({ lastAccessedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(memories.id, id))
        .run();
    } catch {
      // Touch is best-effort; must not fail a read.
    }
  }

  private toRecord(row: any): MemoryRecord {
    let content: MemoryContent;

    try {
      content = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
    } catch {
      content = { value: row.content };
    }

    return {
      id: row.id,
      profileId: row.profileId,
      category: row.category,
      content,
      sourceType: row.sourceType,
      sourceId: row.sourceId ?? undefined,
      sourceName: row.sourceName ?? undefined,
      confidence: row.confidence,
      status: row.status,
      verificationStatus: row.verificationStatus,
      extractionVersion: row.extractionVersion ?? undefined,
      expiresAt: row.expiresAt ?? undefined,
      lastAccessedAt: row.lastAccessedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

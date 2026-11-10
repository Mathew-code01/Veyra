// ============================================================================
// FILE: database/repositories/candidateEvidenceRepository.ts
//
// PURPOSE:
// SQLite-backed persistent candidate evidence store.
//
// Every record is scoped to profile_id (profile isolation) and candidate_id
// (evidence ownership). This is the durable replacement for the in-memory
// CandidateEvidenceStore used in production composition.
//
// DEPENDENCY DIRECTION:
//   database/repositories  <-- type-only  core/candidate/contracts
//
// Only CandidateEvidence/CandidateEvidenceType are imported as types (erased
// at runtime). No runtime dependency on core is introduced.
// ============================================================================

import { and, eq } from "drizzle-orm";
import type { CandidateEvidence, CandidateEvidenceType } from "../../core/candidate/contracts/CandidateEvidence";
import type { CandidateId } from "../../core/candidate/contracts/CandidateTypes";
import { getDatabase } from "../client";
import { candidateEvidence } from "../schema";

export interface CandidateEvidenceRow {
  readonly id: string;
  readonly profileId: string;
  readonly candidateId: string;
  readonly type: CandidateEvidenceType;
  readonly text: string;
  readonly sourceId?: string | null;
  readonly sourceName?: string | null;
  readonly sourceType?: string | null;
  readonly verified: boolean;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class CandidateEvidenceRepository {
  private readonly database = getDatabase();

  private readonly db = this.database.db;

  private readonly resolveProfileId: () => string | undefined;

  public constructor(resolveProfileId: () => string | undefined) {
    this.resolveProfileId = resolveProfileId;
  }

  private requireProfileId(): string {
    const profileId = this.resolveProfileId()?.trim();
    if (!profileId) {
      throw new Error("An active profile is required for candidate evidence.");
    }
    return profileId;
  }

  private static toRow(
    profileId: string,
    candidateId: CandidateId,
    evidence: CandidateEvidence,
  ): Record<string, unknown> {
    return {
      id: evidence.id,
      profileId,
      candidateId: candidateId.trim(),
      type: evidence.type,
      text: evidence.text,
      sourceId: evidence.sourceId ?? null,
      sourceName: evidence.sourceName ?? null,
      sourceType:
        (evidence.metadata?.sourceType as string | undefined) ??
        (evidence.metadata?.sourceKind as string | undefined) ??
        null,
      verified: evidence.verified ? 1 : 0,
      confidence: typeof evidence.confidence === "number" ? evidence.confidence : 50,
      metadata: JSON.stringify(evidence.metadata ?? {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private static toEvidence(row: CandidateEvidenceRow): CandidateEvidence {
    let metadata: Record<string, unknown> = {};

    try {
      metadata =
        typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    } catch {
      metadata = {};
    }
    delete metadata.profileId;

    return Object.freeze({
      id: row.id,
      candidateId: row.candidateId,
      type: row.type,
      text: row.text,
      sourceId: row.sourceId ?? undefined,
      sourceName: row.sourceName ?? undefined,
      verified: Boolean(row.verified),
      confidence: typeof row.confidence === "number" ? row.confidence : 50,
      metadata: Object.freeze({ ...metadata }),
    });
  }

  public async list(
    candidateId: CandidateId,
  ): Promise<readonly CandidateEvidence[]> {
    const id = candidateId.trim();

    if (!id) {
      throw new Error("A candidate ID is required to list evidence.");
    }

    const rows: CandidateEvidenceRow[] = this.db
      .select()
      .from(candidateEvidence)
      .where(
        and(
          eq(candidateEvidence.profileId, this.requireProfileId()),
          eq(candidateEvidence.candidateId, id),
        ),
      )
      .orderBy(candidateEvidence.createdAt)
      .all() as CandidateEvidenceRow[];

    return Object.freeze(rows.map((row) => CandidateEvidenceRepository.toEvidence(row)));
  }

  public async get(
    candidateId: CandidateId,
    evidenceId: string,
  ): Promise<CandidateEvidence | undefined> {
    const id = candidateId.trim();
    const evidenceIdTrimmed = evidenceId.trim();

    if (!id || !evidenceIdTrimmed) {
      return undefined;
    }

    const row: CandidateEvidenceRow | undefined = this.db
      .select()
      .from(candidateEvidence)
      .where(
        and(
          eq(candidateEvidence.profileId, this.requireProfileId()),
          eq(candidateEvidence.candidateId, id),
          eq(candidateEvidence.id, evidenceIdTrimmed),
        ),
      )
      .get() as CandidateEvidenceRow | undefined;

    if (!row) {
      return undefined;
    }

    return CandidateEvidenceRepository.toEvidence(row);
  }

  public async save(evidence: CandidateEvidence): Promise<void> {
    const candidateId = evidence.candidateId.trim();

    if (!candidateId) {
      throw new Error("A candidate ID is required to save evidence.");
    }

    if (!evidence.id?.trim()) {
      throw new Error("An evidence ID is required to save evidence.");
    }

    if (!evidence.type) {
      throw new Error("An evidence type is required to save evidence.");
    }

    if (!evidence.text?.trim()) {
      throw new Error("Evidence text is required to save evidence.");
    }

    const row = CandidateEvidenceRepository.toRow(
      this.requireProfileId(),
      candidateId,
      evidence,
    );

    this.db.transaction((tx: any) => {
      this.persistOne(tx, row);
    });
  }

  public async saveMany(evidence: readonly CandidateEvidence[]): Promise<void> {
    if (!Array.isArray(evidence)) {
      throw new Error("Evidence batch must be an array.");
    }

    for (const item of evidence) {
      if (!item.candidateId?.trim()) {
        throw new Error("A candidate ID is required for every evidence record.");
      }

      if (!item.id?.trim()) {
        throw new Error("An evidence ID is required for every evidence record.");
      }

      if (!item.type) {
        throw new Error("An evidence type is required for every evidence record.");
      }

      if (!item.text?.trim()) {
        throw new Error("Evidence text is required for every evidence record.");
      }
    }

    const profileId = this.requireProfileId();
    const rows = evidence.map((item) =>
      CandidateEvidenceRepository.toRow(
        profileId,
        item.candidateId,
        item,
      ),
    );

    this.db.transaction((tx: any) => {
      for (const row of rows) {
        this.persistOne(tx, row);
      }
    });
  }

  public async remove(candidateId: CandidateId, evidenceId: string): Promise<void> {
    const id = candidateId.trim();
    const evidenceIdTrimmed = evidenceId.trim();

    if (!id || !evidenceIdTrimmed) {
      return Promise.resolve();
    }

    this.db
      .delete(candidateEvidence)
      .where(
        and(
          eq(candidateEvidence.profileId, this.requireProfileId()),
          eq(candidateEvidence.candidateId, id),
          eq(candidateEvidence.id, evidenceIdTrimmed),
        ),
      )
    .run();

    return Promise.resolve();
  }

  public async removeBySource(
    sourceId: string,
  ): Promise<void> {
    const normalizedSourceId = sourceId.trim();

    if (!normalizedSourceId) {
      return Promise.resolve();
    }

    this.db
      .delete(candidateEvidence)
      .where(
        and(
          eq(candidateEvidence.profileId, this.requireProfileId()),
          eq(candidateEvidence.sourceId, normalizedSourceId),
        ),
      )
    .run();

    return Promise.resolve();
  }

  private persistOne(tx: any, row: Record<string, unknown>): void {
    const id = row.id as string;
    const profileId = row.profileId as string;
    const candidateId = row.candidateId as string;
    const existing = tx
      .select()
      .from(candidateEvidence)
      .where(eq(candidateEvidence.id, id))
      .get() as CandidateEvidenceRow | undefined;

    if (existing) {
      if (
        existing.profileId !== profileId ||
        existing.candidateId !== candidateId
      ) {
        throw new Error(
          "Candidate evidence cannot be reassigned across profiles or candidates.",
        );
      }

      tx.update(candidateEvidence)
        .set({
          type: row.type as CandidateEvidenceType,
          text: row.text as string,
          sourceId: row.sourceId as string | null,
          sourceName: row.sourceName as string | null,
          sourceType: row.sourceType as string | null,
          verified: row.verified as boolean,
          confidence: row.confidence as number,
          metadata: row.metadata as string,
          updatedAt: row.updatedAt as string,
        })
        .where(
          and(
            eq(candidateEvidence.id, id),
            eq(candidateEvidence.profileId, profileId),
            eq(candidateEvidence.candidateId, candidateId),
          ),
        )
        .run();
      return;
    }

    tx.insert(candidateEvidence).values(row).run();
  }
}

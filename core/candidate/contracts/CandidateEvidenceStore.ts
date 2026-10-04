// ============================================================================
// FILE: core/candidate/contracts/CandidateEvidenceStore.ts
// PURPOSE:
// Persistence boundary for candidate evidence.
//
// Candidate owns evidence storage. Documents, Context, and other producers
// write through an adapter instead of mutating Candidate internals directly.
// ============================================================================

import type { CandidateEvidence } from "./CandidateEvidence";
import type { CandidateId } from "./CandidateTypes";

export interface CandidateEvidenceStore {
  list(candidateId: CandidateId): Promise<readonly CandidateEvidence[]>;

  get(
    candidateId: CandidateId,
    evidenceId: string,
  ): Promise<CandidateEvidence | undefined>;

  save(evidence: CandidateEvidence): Promise<void>;

  saveMany(evidence: readonly CandidateEvidence[]): Promise<void>;

  remove(candidateId: CandidateId, evidenceId: string): Promise<void>;
}

import { CandidateError } from "../errors/CandidateError";
import { CandidateValidator } from "../validation/CandidateValidator";

export class InMemoryCandidateEvidenceStore implements CandidateEvidenceStore {
  private readonly records = new Map<string, CandidateEvidence>();

  private readonly validator: CandidateValidator;

  public constructor(validator: CandidateValidator = new CandidateValidator()) {
    this.validator = validator;
  }

  public async list(
    candidateId: CandidateId,
  ): Promise<readonly CandidateEvidence[]> {
    this.validator.validateCandidateId(candidateId);

    return Object.freeze(
      [...this.records.values()]
        .filter((item) => item.candidateId === candidateId.trim())
        .map((item) => this.clone(item)),
    );
  }

  public async get(
    candidateId: CandidateId,
    evidenceId: string,
  ): Promise<CandidateEvidence | undefined> {
    this.validator.validateCandidateId(candidateId);

    const id = evidenceId.trim();

    if (!id) {
      throw CandidateError.invalidRequest("Evidence id is required.", {
        stage: "evidence",
        candidateId: candidateId.trim(),
      });
    }

    const item = this.records.get(id);

    if (!item || item.candidateId !== candidateId.trim()) {
      return undefined;
    }

    return this.clone(item);
  }

  public async save(evidence: CandidateEvidence): Promise<void> {
    const validation = this.validator.validateEvidence(evidence);

    if (!validation.valid) {
      throw CandidateError.invalidRequest(
        "Candidate evidence failed validation.",
        {
          stage: "evidence",
          candidateId: evidence?.candidateId,
          recordId: evidence?.id,
          reasons: validation.reasons,
        },
      );
    }

    const id = evidence.id.trim();
    const candidateId = evidence.candidateId.trim();

    const existing = this.records.get(id);

    if (existing && existing.candidateId !== candidateId) {
      throw CandidateError.conflict(
        "Evidence cannot be reassigned to another candidate.",
        {
          stage: "evidence",
          candidateId,
          recordId: id,
        },
      );
    }

    this.records.set(
      id,
      this.clone({
        ...evidence,
        id,
        candidateId,
      }),
    );
  }

  public async saveMany(evidence: readonly CandidateEvidence[]): Promise<void> {
    const normalized: CandidateEvidence[] = [];

    for (const item of evidence) {
      const validation = this.validator.validateEvidence(item);

      if (!validation.valid) {
        throw CandidateError.invalidRequest(
          "Candidate evidence failed validation.",
          {
            stage: "evidence",
            candidateId: item?.candidateId,
            recordId: item?.id,
            reasons: validation.reasons,
          },
        );
      }

      const id = item.id.trim();
      const candidateId = item.candidateId.trim();

      const existing = this.records.get(id);

      if (existing && existing.candidateId !== candidateId) {
        throw CandidateError.conflict(
          "Evidence cannot be reassigned to another candidate.",
          {
            stage: "evidence",
            candidateId,
            recordId: id,
          },
        );
      }

      normalized.push(
        this.clone({
          ...item,
          id,
          candidateId,
        }),
      );
    }

    // Validate the entire batch before mutating the store.
    //
    // This prevents a partially-ingested document analysis when one fact
    // in the batch is invalid.
    for (const item of normalized) {
      this.records.set(item.id, item);
    }
  }

  public async remove(
    candidateId: CandidateId,
    evidenceId: string,
  ): Promise<void> {
    this.validator.validateCandidateId(candidateId);

    const id = evidenceId.trim();

    const existing = this.records.get(id);

    if (existing?.candidateId === candidateId.trim()) {
      this.records.delete(id);
    }
  }

  private clone(evidence: CandidateEvidence): CandidateEvidence {
    return Object.freeze({
      ...evidence,

      id: evidence.id.trim(),

      candidateId: evidence.candidateId.trim(),

      sourceId: evidence.sourceId?.trim() || undefined,

      sourceName: evidence.sourceName?.trim() || undefined,

      metadata:
        evidence.metadata === undefined
          ? undefined
          : Object.freeze({
              ...evidence.metadata,
            }),
    });
  }
}

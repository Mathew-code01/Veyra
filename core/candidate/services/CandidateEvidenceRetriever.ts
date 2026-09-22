// ============================================================================
// FILE: core/candidate/services/CandidateEvidenceRetriever.ts
// PURPOSE:
// Normalizes evidence returned by a CandidateEvidenceRetrievalPort.
//
// IMPORTANT:
// This service deliberately does NOT depend on:
//   - ContextManager
//   - embeddings
//   - AIManager
//   - InterviewEngine
//   - ConversationManager
//   - cloud providers
//   - local model runtimes
//
// Candidate-5 can later provide the actual retrieval adapter.
// ============================================================================

import type { CandidateEvidence } from "../contracts/CandidateEvidence";

import type {
  CandidateEvidenceQuery,
  CandidateEvidenceResult,
  CandidateEvidenceRetrievalPort,
  CandidateEvidenceSourceItem,
} from "../contracts/CandidateEvidenceRetrieval";

import type { CandidateId } from "../contracts/CandidateTypes";

import { CandidateError } from "../errors/CandidateError";

import { CandidateValidator } from "../validation/CandidateValidator";

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 100;
const DEFAULT_MIN_SCORE = 0;

export interface CandidateEvidenceRetrieverOptions {
  readonly retrievalPort: CandidateEvidenceRetrievalPort;

  readonly validator?: CandidateValidator;
}

export class CandidateEvidenceRetriever {
  private readonly retrievalPort: CandidateEvidenceRetrievalPort;

  private readonly validator: CandidateValidator;

  public constructor(options: CandidateEvidenceRetrieverOptions) {
    this.retrievalPort = options.retrievalPort;

    this.validator = options.validator ?? new CandidateValidator();
  }

  public async retrieve(
    request: CandidateEvidenceQuery,
  ): Promise<CandidateEvidenceResult> {
    const candidateId = this.validateCandidateId(request.candidateId);

    const question = request.question.trim();

    if (!question) {
      throw CandidateError.invalidRequest(
        "Evidence retrieval question is required.",
        {
          stage: "retrieval",
          candidateId,
        },
      );
    }

    const limit = this.normalizeLimit(request.limit);

    const minScore = this.normalizeMinScore(request.minScore);

    if (request.signal?.aborted) {
      throw CandidateError.cancelled(candidateId);
    }

    try {
      const result = await this.retrievalPort.retrieve({
        candidateId,
        question,
        limit,
        minScore,
        signal: request.signal,
      });

      if (request.signal?.aborted) {
        throw CandidateError.cancelled(candidateId);
      }

      if (!result || !Array.isArray(result.items)) {
        throw CandidateError.retrievalFailure(
          "Candidate evidence retrieval returned an invalid result.",
          {
            candidateId,
          },
        );
      }

      const evidence = result.items.map((item) =>
        this.normalizeEvidence(item, candidateId),
      );

      const validation =
        evidence.length === 0
          ? {
              valid: true,
              confidence: 0,
              reasons: [],
            }
          : this.validator.validateEvidenceCollection(evidence);

      if (!validation.valid) {
        throw CandidateError.retrievalFailure(
          "Candidate evidence retrieval returned invalid evidence.",
          {
            candidateId,
            reasons: validation.reasons,
          },
        );
      }

      return Object.freeze({
        candidateId,
        question,
        evidence: Object.freeze(evidence),
        metadata: Object.freeze({
          ...result.metadata,
          limit,
          minScore,
          returnedCount: evidence.length,
        }),
      });
    } catch (error) {
      if (error instanceof CandidateError) {
        throw error;
      }

      throw CandidateError.retrievalFailure(
        "Failed to retrieve candidate evidence.",
        {
          candidateId,
          cause: error,
        },
      );
    }
  }

  private normalizeEvidence(
    item: CandidateEvidenceSourceItem,
    candidateId: CandidateId,
  ): CandidateEvidence {
    if (item.candidateId.trim() !== candidateId) {
      throw CandidateError.conflict(
        "Retrieved evidence belongs to a different candidate.",
        {
          stage: "retrieval",
          candidateId,
          recordId: item.id,
        },
      );
    }

    if (!item.id.trim()) {
      throw CandidateError.retrievalFailure(
        "Retrieved evidence is missing an id.",
        {
          candidateId,
        },
      );
    }

    if (!item.text.trim()) {
      throw CandidateError.retrievalFailure(
        `Retrieved evidence '${item.id}' contains empty text.`,
        {
          candidateId,
          recordId: item.id,
        },
      );
    }

    if (!Number.isFinite(item.score) || item.score < 0 || item.score > 1) {
      throw CandidateError.retrievalFailure(
        `Evidence '${item.id}' returned an invalid relevance score.`,
        {
          candidateId,
          recordId: item.id,
        },
      );
    }

    const evidence: CandidateEvidence = Object.freeze({
      id: item.id.trim(),
      candidateId,
      type: item.type,
      text: item.text.trim(),
      sourceId: item.sourceId?.trim() || undefined,
      sourceName: item.sourceName?.trim() || undefined,
      verified: item.verified,
      confidence: item.score,
      metadata:
        item.metadata === undefined
          ? undefined
          : Object.freeze({
              ...item.metadata,
              retrievalScore: item.score,
            }),
    });

    const validation = this.validator.validateEvidence(evidence);

    if (!validation.valid) {
      throw CandidateError.retrievalFailure(
        `Retrieved evidence '${item.id}' failed validation.`,
        {
          candidateId,
          recordId: item.id,
          reasons: validation.reasons,
        },
      );
    }

    return evidence;
  }

  private validateCandidateId(candidateId: string): CandidateId {
    this.validator.validateCandidateId(candidateId);

    return candidateId.trim();
  }

  private normalizeLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_LIMIT;
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw CandidateError.invalidRequest(
        `Evidence retrieval limit must be an integer between 1 and ${MAX_LIMIT}.`,
        {
          stage: "retrieval",
        },
      );
    }

    return limit;
  }

  private normalizeMinScore(minScore: number | undefined): number {
    if (minScore === undefined) {
      return DEFAULT_MIN_SCORE;
    }

    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
      throw CandidateError.invalidRequest(
        "Evidence retrieval minScore must be between 0 and 1.",
        {
          stage: "retrieval",
        },
      );
    }

    return minScore;
  }
}

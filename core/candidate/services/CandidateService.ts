// ============================================================================
// FILE: core/candidate/services/CandidateService.ts
// PURPOSE:
// Application-facing Candidate facade.
//
// This is the boundary that answers:
//   "What do we know about the candidate?"
//
// It implements the shared CandidateServiceContract while keeping the
// authoritative candidate domain inside core/candidate.
//
// It deliberately does not depend on DocumentService, ContextManager,
// InterviewEngine, ConversationManager, AIManager, or model runtimes.
// ============================================================================

import type { CandidateContext } from "../contracts/CandidateContext";

import type { CandidateEvidence } from "../contracts/CandidateEvidence";

import type { CandidateEvidenceResult } from "../contracts/CandidateEvidenceRetrieval";

import type {
  CandidateId,
  CandidateProfile,
} from "../contracts/CandidateTypes";

import { CandidateError } from "../errors/CandidateError";

import type { CandidateProfileStore } from "../stores/CandidateProfileStore";

import { CandidateContextBuilder } from "./CandidateContextBuilder";

import { CandidateEvidenceRetriever } from "./CandidateEvidenceRetriever";

import type {
  CandidateGetRequest,
  CandidateGetResponse,
  CandidateServiceContract,
} from "../../../shared/contracts/candidate.contract";

import type { CandidateSummary } from "../../../shared/types/candidate";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CandidateServiceOptions {
  readonly profileStore: CandidateProfileStore;

  readonly contextBuilder: CandidateContextBuilder;

  readonly evidenceRetriever?: CandidateEvidenceRetriever;
}

export interface CandidateContextRequest {
  readonly candidateId: CandidateId;

  readonly signal?: AbortSignal;
}

export class CandidateService implements CandidateServiceContract {
  private readonly profileStore: CandidateProfileStore;

  private readonly contextBuilder: CandidateContextBuilder;

  private readonly evidenceRetriever?: CandidateEvidenceRetriever;

  public constructor(options: CandidateServiceOptions) {
    this.profileStore = options.profileStore;

    this.contextBuilder = options.contextBuilder;

    this.evidenceRetriever = options.evidenceRetriever;
  }

  /**
   * Shared cross-boundary operation.
   *
   * Only the minimal CandidateSummary leaves the Candidate domain here.
   */
  public async getSummary(
    request: CandidateGetRequest,
  ): Promise<CandidateGetResponse> {
    const candidateId = this.normalizeBoundaryCandidateId(request.candidateId);

    if (request.signal?.aborted) {
      throw CandidateError.cancelled(candidateId);
    }

    try {
      const profile = await this.profileStore.get(candidateId);

      if (!profile) {
        throw CandidateError.notFound(
          `Candidate profile '${candidateId}' was not found.`,
          {
            stage: "profile",
            candidateId,
          },
        );
      }

      if (request.signal?.aborted) {
        throw CandidateError.cancelled(candidateId);
      }

      return Object.freeze({
        candidate: this.toSharedSummary(profile),
      });
    } catch (error) {
      if (error instanceof CandidateError) {
        throw error;
      }

      throw CandidateError.fromUnknown(error, "profile", {
        candidateId,
      });
    }
  }

  /**
   * Rich domain operation for Candidate-owned consumers.
   *
   * This does not change the shared contract.
   */
  public async getContext(
    request: CandidateContextRequest,
  ): Promise<CandidateContext> {
    return this.contextBuilder.build({
      candidateId: request.candidateId,
      signal: request.signal,
    });
  }

  /**
   * Candidate evidence retrieval operation.
   */
  public async retrieveEvidence(
    request: Parameters<CandidateEvidenceRetriever["retrieve"]>[0],
  ): Promise<CandidateEvidenceResult> {
    if (!this.evidenceRetriever) {
      throw CandidateError.retrievalFailure(
        "Candidate evidence retrieval is not configured.",
        {
          candidateId: request.candidateId,
        },
      );
    }

    return this.evidenceRetriever.retrieve(request);
  }

  /**
   * Convenience operation for domain callers that need
   * the current complete candidate knowledge snapshot.
   */
  public async getKnownEvidence(
    candidateId: CandidateId,
    signal?: AbortSignal,
  ): Promise<readonly CandidateEvidence[]> {
    const context = await this.getContext({
      candidateId,
      signal,
    });

    return context.evidence;
  }

  private normalizeBoundaryCandidateId(candidateId: string): CandidateId {
    if (typeof candidateId !== "string" || !candidateId.trim()) {
      throw CandidateError.invalidRequest("Candidate id is required.", {
        stage: "validation",
      });
    }

    const normalized = candidateId.trim();

    /*
     * The shared boundary uses UUID.
     *
     * The internal Candidate domain remains string-based so the domain
     * does not have to import shared branded transport types.
     *
     * The boundary enforces the UUID invariant.
     */
    if (!UUID_PATTERN.test(normalized)) {
      throw CandidateError.invalidRequest(
        "Candidate id must be a valid UUID at the shared boundary.",
        {
          stage: "validation",
          candidateId: normalized,
        },
      );
    }

    return normalized;
  }

  private toSharedSummary(profile: CandidateProfile): CandidateSummary {
    if (!UUID_PATTERN.test(profile.id.trim())) {
      throw CandidateError.invalidRequest(
        "Candidate profile id is not a valid UUID for the shared boundary.",
        {
          stage: "profile",
          candidateId: profile.id,
        },
      );
    }

    const updatedAt = new Date(profile.updatedAt);

    if (!Number.isFinite(updatedAt.getTime())) {
      throw CandidateError.invalidRequest(
        "Candidate updatedAt is not a valid ISO date.",
        {
          stage: "profile",
          candidateId: profile.id,
        },
      );
    }

    return Object.freeze({
      candidateId: profile.id.trim() as CandidateSummary["candidateId"],

      fullName: profile.fullName.trim(),

      headline: profile.headline?.trim() || undefined,

      summary: profile.summary?.trim() || undefined,

      updatedAt: updatedAt.toISOString() as CandidateSummary["updatedAt"],
    });
  }
}

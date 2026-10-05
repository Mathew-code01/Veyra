// ============================================================================
// FILE: core/candidate/services/CandidateService.ts
//
// PURPOSE:
// Application-facing Candidate facade.
//
// This is the boundary that answers:
//
//     "What do we know about the candidate?"
//
// It implements the shared CandidateServiceContract while keeping the
// authoritative candidate domain inside core/candidate.
//
// It deliberately does not depend on:
//   - DocumentService
//   - InterviewEngine
//   - ConversationManager
//   - AIManager
//   - model runtimes
//
// Candidate may publish its canonical CandidateContext into the generic
// Context subsystem through CandidateContextPublisher.
//
// IMPORTANT:
//
// Candidate owns candidate knowledge.
//
// Context owns generic indexing/retrieval.
//
// Therefore CandidateContextPublisher is the only bridge used here.
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

import { CandidateContextPublisher } from "./CandidateContextPublisher";

import { CandidateEvidenceRetriever } from "./CandidateEvidenceRetriever";

import type {
  CandidateGetRequest,
  CandidateGetResponse,
  CandidateServiceContract,
} from "../../../shared/contracts/candidate.contract";

import type { CandidateSummary } from "../../../shared/types/candidate";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ============================================================================
// OPTIONS
// ============================================================================

export interface CandidateServiceOptions {
  readonly profileStore: CandidateProfileStore;

  readonly contextBuilder: CandidateContextBuilder;

  readonly evidenceRetriever?: CandidateEvidenceRetriever;

  /**
   * Optional Candidate -> Context publisher.
   *
   * Candidate remains usable without Context integration.
   *
   * This is intentionally optional so Candidate does not become
   * operationally dependent on Context during isolated domain tests.
   */
  readonly contextPublisher?: CandidateContextPublisher;
}

// ============================================================================
// REQUESTS
// ============================================================================

export interface CandidateContextRequest {
  readonly candidateId: CandidateId;

  readonly signal?: AbortSignal;
}

export interface CandidatePublishContextRequest {
  readonly candidateId: CandidateId;

  readonly signal?: AbortSignal;
}

// ============================================================================
// SERVICE
// ============================================================================

export class CandidateService implements CandidateServiceContract {
  private readonly profileStore: CandidateProfileStore;

  private readonly contextBuilder: CandidateContextBuilder;

  private readonly evidenceRetriever?: CandidateEvidenceRetriever;

  private readonly contextPublisher?: CandidateContextPublisher;

  public constructor(options: CandidateServiceOptions) {
    if (!options) {
      throw CandidateError.invalidRequest(
        "Candidate service options are required.",
        {
          stage: "validation",
        },
      );
    }

    if (!options.profileStore) {
      throw CandidateError.invalidRequest(
        "Candidate profile store is required.",
        {
          stage: "profile",
        },
      );
    }

    if (!options.contextBuilder) {
      throw CandidateError.invalidRequest(
        "Candidate context builder is required.",
        {
          stage: "context",
        },
      );
    }

    this.profileStore = options.profileStore;

    this.contextBuilder = options.contextBuilder;

    this.evidenceRetriever = options.evidenceRetriever;

    this.contextPublisher = options.contextPublisher;
  }

  // ==========================================================================
  // SHARED CONTRACT
  // ==========================================================================

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

  // ==========================================================================
  // CANDIDATE CONTEXT
  // ==========================================================================

  /**
   * Builds the authoritative CandidateContext.
   *
   * This is a Candidate-domain operation.
   *
   * It does NOT index anything into generic Context.
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
   * Publishes the current canonical CandidateContext into Context.
   *
   * This is deliberately explicit.
   *
   * Reading candidate context must not unexpectedly cause:
   *
   *   - embeddings
   *   - vector writes
   *   - context replacement
   *
   * Therefore callers that change Candidate data can explicitly invoke:
   *
   *     candidateService.publishContext(...)
   */
  public async publishContext(
    request: CandidatePublishContextRequest,
  ): Promise<Awaited<ReturnType<CandidateContextPublisher["publish"]>>> {
    const candidateId = this.normalizeContextCandidateId(request.candidateId);

    if (request.signal?.aborted) {
      throw CandidateError.cancelled(candidateId);
    }

    if (!this.contextPublisher) {
      throw CandidateError.contextBuildFailure(
        "Candidate context publishing is not configured.",
        {
          candidateId,
          metadata: {
            operation: "publish",
            integration: "context",
          },
        },
      );
    }

    return this.contextPublisher.publish({
      candidateId,

      signal: request.signal,
    });
  }

  /**
   * Removes the Candidate-owned Context representation.
   *
   * This is used when a candidate is permanently deleted or when the
   * application intentionally removes candidate knowledge from generic
   * Context.
   */
  public async removePublishedContext(
    candidateId: CandidateId,
    signal?: AbortSignal,
  ): Promise<void> {
    const normalizedCandidateId = this.normalizeContextCandidateId(candidateId);

    if (signal?.aborted) {
      throw CandidateError.cancelled(normalizedCandidateId);
    }

    if (!this.contextPublisher) {
      throw CandidateError.contextBuildFailure(
        "Candidate context publishing is not configured.",
        {
          candidateId: normalizedCandidateId,
          metadata: {
            operation: "remove",
            integration: "context",
          },
        },
      );
    }

    await this.contextPublisher.remove(normalizedCandidateId, signal);
  }

  // ==========================================================================
  // EVIDENCE RETRIEVAL
  // ==========================================================================

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

  // ==========================================================================
  // COMPLETE CANDIDATE KNOWLEDGE
  // ==========================================================================

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

  // ==========================================================================
  // CONTEXT BOUNDARY VALIDATION
  // ==========================================================================

  /**
   * CandidateContextPublisher operates on the internal CandidateId contract.
   *
   * Unlike the shared CandidateSummary boundary, this does not require
   * re-validating the UUID transport contract here because the
   * CandidateContextBuilder owns the authoritative Candidate validation.
   *
   * We still reject empty IDs before crossing into the Context integration.
   */
  private normalizeContextCandidateId(candidateId: CandidateId): CandidateId {
    if (typeof candidateId !== "string" || !candidateId.trim()) {
      throw CandidateError.invalidRequest(
        "Candidate id is required for context publishing.",
        {
          stage: "validation",
        },
      );
    }

    return candidateId.trim();
  }

  // ==========================================================================
  // SHARED BOUNDARY VALIDATION
  // ==========================================================================

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

  // ==========================================================================
  // SHARED SUMMARY
  // ==========================================================================

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

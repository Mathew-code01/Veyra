// ============================================================================
// FILE: core/candidate/services/CandidateDocumentEvidenceAdapter.ts
//
// PURPOSE:
// Converts canonical DocumentAnalysis into CandidateEvidence.
//
// CONNECTION:
//
//   DocumentAnalysis
//        ↓
//   CandidateDocumentEvidenceAdapter
//        ↓
//   CandidateEvidenceStore
//
// IMPORTANT:
//
// This adapter belongs to Candidate.
//
// Candidate decides:
// - how document facts are categorized
// - how provenance is preserved
// - whether facts are verified
// - what confidence is assigned
// - how evidence is persisted
//
// DocumentService never receives Candidate internals.
// ============================================================================

import type { DocumentAnalysis } from "../../../shared/types/documents";

import type { CandidateEvidence } from "../contracts/CandidateEvidence";

import type {
  CandidateDocumentEvidenceIngestRequest,
  CandidateDocumentEvidenceIngestResult,
  CandidateDocumentEvidencePort,
} from "../contracts/CandidateDocumentEvidence";

import type { CandidateEvidenceStore } from "../contracts/CandidateEvidenceStore";

import type { CandidateEvidenceType } from "../contracts/CandidateEvidence";

import { CandidateError } from "../errors/CandidateError";

import { CandidateValidator } from "../validation/CandidateValidator";

// ============================================================================
// OPTIONS
// ============================================================================

export interface CandidateDocumentEvidenceAdapterOptions {
  /**
   * Candidate-owned evidence persistence.
   */
  readonly evidenceStore: CandidateEvidenceStore;

  /**
   * Optional shared Candidate validator.
   */
  readonly validator?: CandidateValidator;
}

// ============================================================================
// ADAPTER
// ============================================================================

export class CandidateDocumentEvidenceAdapter implements CandidateDocumentEvidencePort {
  private readonly evidenceStore: CandidateEvidenceStore;

  private readonly validator: CandidateValidator;

  public constructor(options: CandidateDocumentEvidenceAdapterOptions) {
    if (!options) {
      throw CandidateError.invalidRequest(
        "Candidate document evidence adapter options are required.",
        {
          stage: "evidence",
        },
      );
    }

    if (!options.evidenceStore) {
      throw CandidateError.invalidRequest(
        "Candidate evidence store is required.",
        {
          stage: "evidence",
        },
      );
    }

    this.evidenceStore = options.evidenceStore;

    this.validator = options.validator ?? new CandidateValidator();
  }

  // ==========================================================================
  // INGEST
  // ==========================================================================

  public async ingest(
    request: CandidateDocumentEvidenceIngestRequest,
  ): Promise<CandidateDocumentEvidenceIngestResult> {
    if (!request) {
      throw CandidateError.invalidRequest(
        "Candidate document evidence ingestion request is required.",
        {
          stage: "evidence",
        },
      );
    }

    this.validator.validateCandidateId(request.candidateId);

    const candidateId = request.candidateId.trim();

    if (request.signal?.aborted) {
      throw CandidateError.cancelled(candidateId);
    }

    try {
      this.validateAnalysis(request.analysis);

      const evidence = request.analysis.facts.map((fact, index) =>
        this.toEvidence(candidateId, request.analysis, fact, index),
      );

      if (request.signal?.aborted) {
        throw CandidateError.cancelled(candidateId);
      }

      /*
       * saveMany validates the entire batch before mutation.
       *
       * Therefore a malformed document analysis cannot partially populate
       * Candidate evidence.
       */
      await this.evidenceStore.saveMany(evidence);

      if (request.signal?.aborted) {
        throw CandidateError.cancelled(candidateId);
      }

      return Object.freeze({
        candidateId,

        documentId: request.analysis.documentId,

        analysisId: request.analysis.analysisId,

        evidence: Object.freeze(evidence),
      });
    } catch (error) {
      if (error instanceof CandidateError) {
        throw error;
      }

      throw CandidateError.storeFailure(
        "Failed to ingest document analysis as candidate evidence.",
        {
          candidateId,

          cause: error,

          metadata: {
            documentId: request.analysis.documentId,

            analysisId: request.analysis.analysisId,
          },
        },
      );
    }
  }

  // ==========================================================================
  // ANALYSIS VALIDATION
  // ==========================================================================

  private validateAnalysis(analysis: DocumentAnalysis): void {
    if (!analysis || typeof analysis !== "object") {
      throw CandidateError.invalidRequest(
        "Document analysis is required for candidate evidence ingestion.",
        {
          stage: "evidence",
        },
      );
    }

    if (
      typeof analysis.documentId !== "string" ||
      !analysis.documentId.trim()
    ) {
      throw CandidateError.invalidRequest(
        "Document analysis must contain a valid documentId.",
        {
          stage: "evidence",
        },
      );
    }

    if (
      typeof analysis.analysisId !== "string" ||
      !analysis.analysisId.trim()
    ) {
      throw CandidateError.invalidRequest(
        "Document analysis must contain a valid analysisId.",
        {
          stage: "evidence",
        },
      );
    }

    if (!Array.isArray(analysis.facts)) {
      throw CandidateError.invalidRequest(
        "Document analysis facts must be an array.",
        {
          stage: "evidence",
          candidateId: undefined,
        },
      );
    }

    if (
      typeof analysis.documentType !== "string" ||
      !analysis.documentType.trim()
    ) {
      throw CandidateError.invalidRequest(
        "Document analysis documentType is required.",
        {
          stage: "evidence",
        },
      );
    }

    if (typeof analysis.format !== "string" || !analysis.format.trim()) {
      throw CandidateError.invalidRequest(
        "Document analysis format is required.",
        {
          stage: "evidence",
        },
      );
    }

    if (typeof analysis.provider !== "string" || !analysis.provider.trim()) {
      throw CandidateError.invalidRequest(
        "Document analysis provider is required.",
        {
          stage: "evidence",
        },
      );
    }

    if (typeof analysis.model !== "string" || !analysis.model.trim()) {
      throw CandidateError.invalidRequest(
        "Document analysis model is required.",
        {
          stage: "evidence",
        },
      );
    }
  }

  // ==========================================================================
  // FACT → EVIDENCE
  // ==========================================================================

  private toEvidence(
    candidateId: CandidateIdString,
    analysis: DocumentAnalysis,
    fact: DocumentAnalysis["facts"][number],
    index: number,
  ): CandidateEvidence {
    const type = this.mapFactCategory(fact.category);

    const evidenceId = `document-analysis:${analysis.analysisId}:fact:${index}`;

    const evidence: CandidateEvidence = Object.freeze({
      id: evidenceId,

      candidateId,

      type,

      text: fact.fact,

      sourceId: analysis.documentId,

      sourceName: `Document ${analysis.documentId}`,

      /*
       * Document-derived facts are not automatically verified.
       *
       * A document is evidence, not proof of truth.
       *
       * Future Candidate verification workflows may upgrade this value.
       */
      verified: false,

      confidence: fact.confidence,

      metadata: Object.freeze({
        sourceKind: "document",

        analysisId: analysis.analysisId,

        documentId: analysis.documentId,

        documentType: analysis.documentType,

        documentFormat: analysis.format,

        provider: analysis.provider,

        model: analysis.model,

        analyzedAt: analysis.analyzedAt,

        documentFactCategory: fact.category,

        sourceChunkIds: [...fact.sourceChunkIds],
      }),
    });

    const validation = this.validator.validateEvidence(evidence);

    if (!validation.valid) {
      throw CandidateError.invalidRequest(
        `Document fact '${index}' failed candidate evidence validation.`,
        {
          stage: "evidence",

          candidateId,

          recordId: evidence.id,

          reasons: validation.reasons,
        },
      );
    }

    return evidence;
  }

  // ==========================================================================
  // FACT CATEGORY MAPPING
  // ==========================================================================

  private mapFactCategory(
    category: DocumentAnalysis["facts"][number]["category"],
  ): CandidateEvidenceType {
    switch (category) {
      case "experience":
        return "experience";

      case "skill":
        return "skill";

      case "project":
        return "project";

      case "education":
        return "education";

      case "certification":
        return "certification";

      /*
       * CandidateEvidence does not currently have separate buckets for:
       *
       * - identity
       * - contact
       * - achievement
       * - preference
       * - other
       *
       * These facts are therefore kept under the neutral "resume" evidence
       * category.
       *
       * The original semantic category is preserved in:
       *
       * metadata.documentFactCategory
       *
       * This avoids destroying semantic information or inventing a new
       * CandidateEvidence type prematurely.
       */
      case "identity":
      case "contact":
      case "achievement":
      case "preference":
      case "other":
      default:
        return "resume";
    }
  }
}

// ============================================================================
// INTERNAL TYPE ALIAS
// ============================================================================
//
// CandidateId is intentionally a string-based domain identifier.
//
// Keeping this alias local avoids coupling this service to shared branded
// transport UUID types.
//
// CandidateValidator remains responsible for Candidate-domain validation.
// ============================================================================

type CandidateIdString = string;

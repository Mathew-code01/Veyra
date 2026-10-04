// ============================================================================
// FILE: core/candidate/services/CandidateDocumentEvidenceAdapter.ts
// PURPOSE:
// Converts canonical DocumentAnalysis into Candidate evidence.
//
// Direction:
//   DocumentAnalysis
//       ↓
//   CandidateDocumentEvidenceAdapter
//       ↓
//   CandidateEvidenceStore
//
// IMPORTANT:
// - DocumentService is not imported.
// - CandidateProfile is not overwritten.
// - AIManager is not imported.
// - Unverified document facts remain unverified evidence.
// - Document provenance is preserved.
// ============================================================================

import type { DocumentAnalysisInput } from "../../../shared/validation/documentSchemas";

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

export interface CandidateDocumentEvidenceAdapterOptions {
  readonly evidenceStore: CandidateEvidenceStore;

  readonly validator?: CandidateValidator;
}

export class CandidateDocumentEvidenceAdapter implements CandidateDocumentEvidencePort {
  private readonly evidenceStore: CandidateEvidenceStore;

  private readonly validator: CandidateValidator;

  public constructor(options: CandidateDocumentEvidenceAdapterOptions) {
    this.evidenceStore = options.evidenceStore;

    this.validator = options.validator ?? new CandidateValidator();
  }

  public async ingest(
    request: CandidateDocumentEvidenceIngestRequest,
  ): Promise<CandidateDocumentEvidenceIngestResult> {
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

      await this.evidenceStore.saveMany(evidence);

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

  private validateAnalysis(analysis: DocumentAnalysisInput): void {
    if (!analysis || typeof analysis !== "object") {
      throw CandidateError.invalidRequest(
        "Document analysis is required for candidate evidence ingestion.",
        {
          stage: "evidence",
        },
      );
    }

    if (!analysis.documentId.trim() || !analysis.analysisId.trim()) {
      throw CandidateError.invalidRequest(
        "Document analysis must contain documentId and analysisId.",
        {
          stage: "evidence",
        },
      );
    }
  }

  private toEvidence(
    candidateId: string,
    analysis: DocumentAnalysisInput,
    fact: DocumentAnalysisInput["facts"][number],
    index: number,
  ): CandidateEvidence {
    const type = this.mapFactCategory(fact.category);

    const evidence = Object.freeze({
      id: `document-analysis:${analysis.analysisId}:fact:${index}`,

      candidateId,

      type,

      text: fact.fact,

      sourceId: analysis.documentId,

      sourceName: `Document ${analysis.documentId}`,

      // Document-derived information is NOT automatically verified.
      verified: false,

      confidence: fact.confidence,

      metadata: Object.freeze({
        sourceKind: "document",

        analysisId: analysis.analysisId,

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

  private mapFactCategory(
    category: DocumentAnalysisInput["facts"][number]["category"],
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

      case "identity":
      case "contact":
      case "achievement":
      case "preference":
      case "other":
      default:
        // The original semantic category remains available through
        // metadata.documentFactCategory.
        //
        // "resume" is the neutral Candidate evidence bucket for facts that
        // do not map directly to a dedicated Candidate domain record.
        return "resume";
    }
  }
}

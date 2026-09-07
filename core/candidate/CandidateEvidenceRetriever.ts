// core/candidate/CandidateEvidenceRetriever.ts

import type { ContextManager, ContextResult } from "../context/ContextManager";

import type { CandidateEvidence } from "./EvidenceValidator";

export interface CandidateEvidenceQuery {
  readonly candidateId: string;
  readonly question: string;
  readonly limit?: number;
  readonly minScore?: number;
}

export interface CandidateEvidenceResult {
  readonly candidateId: string;
  readonly question: string;
  readonly evidence: readonly CandidateEvidence[];
  readonly context: ContextResult;
}

export class CandidateEvidenceRetriever {
  public constructor(private readonly contextManager: ContextManager) {}

  public async retrieve(
    request: CandidateEvidenceQuery,
  ): Promise<CandidateEvidenceResult> {
    const question = request.question.trim();

    if (!request.candidateId.trim()) {
      throw new Error("Candidate id is required.");
    }

    if (!question) {
      throw new Error("Evidence query is required.");
    }

    const context = await this.contextManager.query({
      query: question,
      limit: request.limit ?? 6,
      minScore: request.minScore ?? 0.3,
      candidateId: request.candidateId,
      documentTypes: ["resume", "experience", "project", "skills", "story"],
    });

    const evidence = context.contexts.map((item): CandidateEvidence => ({
      id: item.id,
      candidateId: request.candidateId,
      type: this.mapEvidenceType(item.metadata.type),
      text: item.text,
      sourceId: item.documentId,
      sourceName:
        typeof item.metadata.documentName === "string"
          ? item.metadata.documentName
          : undefined,
      verified: item.metadata.verified === true,
      confidence: Math.min(1, Math.max(0, item.rankScore)),
    }));

    return {
      candidateId: request.candidateId,
      question,
      evidence,
      context,
    };
  }

  private mapEvidenceType(value: unknown): CandidateEvidence["type"] {
    switch (value) {
      case "experience":
      case "project":
      case "skill":
      case "story":
      case "education":
      case "certification":
      case "resume":
        return value;

      default:
        return "resume";
    }
  }
}
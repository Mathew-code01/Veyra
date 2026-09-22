// ============================================================================
// FILE: core/candidate/contracts/CandidateContext.ts
// PURPOSE:
// Represents candidate information prepared for downstream consumers.
//
// This contract deliberately does not depend on AIManager, ContextManager,
// InterviewEngine, ConversationManager, or Vision.
// ============================================================================

import type { CandidateId } from "./CandidateTypes";
import type { CandidateEvidence } from "./CandidateEvidence";

export interface CandidateContext {
  readonly candidateId: CandidateId;

  readonly evidence: readonly CandidateEvidence[];

  /**
   * Human/LLM-readable representation of candidate facts.
   *
   * This is derived data. The authoritative information remains the
   * structured candidate records and evidence.
   */
  readonly text: string;

  readonly generatedAt: string;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

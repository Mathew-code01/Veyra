// shared/types/candidate.ts

import type { UUID, ISODateString } from "./common";

/**
 * Minimal cross-boundary candidate identity.
 *
 * This is NOT the complete candidate domain model.
 * The authoritative candidate model remains in core/candidate.
 */
export interface CandidateReference {
  readonly candidateId: UUID;
}

/**
 * Minimal candidate summary suitable for client/server boundaries.
 */
export interface CandidateSummary {
  readonly candidateId: UUID;

  readonly fullName: string;

  readonly headline?: string;

  readonly summary?: string;

  readonly updatedAt: ISODateString;
}

// ============================================================================
// FILE: core/reliability/contracts/RetryContract.ts
//
// PURPOSE:
// Public retry contract.
//
// Retry is a decision mechanism, not simply a loop.
// ============================================================================

import type { RetryDecision, RetryPolicy } from "../retry/RetryPolicy";

export interface RetryContract {
  decide(policy: RetryPolicy, attempt: number, error: unknown): RetryDecision;

  shouldRetry(policy: RetryPolicy, attempt: number, error: unknown): boolean;
}

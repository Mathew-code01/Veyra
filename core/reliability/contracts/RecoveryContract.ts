// ============================================================================
// FILE: core/reliability/contracts/RecoveryContract.ts
//
// PURPOSE:
// Defines how a failed operation can request recovery.
//
// Recovery is policy-driven.
// It does not blindly retry every failure.
// ============================================================================

import type { RecoveryAction } from "../recovery/RecoveryAction";

import type {
  RecoveryContext,
  RecoveryResult,
} from "../recovery/RecoveryManager";

export interface RecoveryContract {
  recover(context: RecoveryContext): Promise<RecoveryResult>;

  getActions(context: RecoveryContext): readonly RecoveryAction[];
}

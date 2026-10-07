// ============================================================================
// FILE: core/reliability/recovery/RecoveryManager.ts
//
// PURPOSE:
// Coordinates recovery after an operation failure.
//
// IMPORTANT:
// RecoveryManager does not invent business-specific recovery.
// Callers provide the available actions.
// ============================================================================

import {
  FailureClassifier,
  type FailureClassification,
} from "../errors/FailureClassifier";

import type { RecoveryAction } from "./RecoveryAction";

import { DEFAULT_RECOVERY_POLICY, type RecoveryPolicy } from "./RecoveryPolicy";

export interface RecoveryContext {
  readonly operationId: string;
  readonly componentId?: string;
  readonly error: unknown;
  readonly attempt: number;
  readonly policy?: RecoveryPolicy;
  readonly actions?: readonly RecoveryAction[];
  readonly signal?: AbortSignal;
}

export interface RecoveryResult {
  readonly recovered: boolean;
  readonly action?: RecoveryAction;
  readonly classification: FailureClassification;
  readonly error?: unknown;
}

export class RecoveryManager {
  private readonly classifier = new FailureClassifier();

  public getActions(context: RecoveryContext): readonly RecoveryAction[] {
    const policy = context.policy ?? DEFAULT_RECOVERY_POLICY;

    const actions = context.actions ?? [];

    const allowed = new Set(policy.actions);

    return Object.freeze(
      [...actions]
        .filter((action) => allowed.has(action.type))
        .filter((action) => {
          if (action.type === "retry") {
            return policy.allowRetry !== false;
          }

          if (action.type === "fallback") {
            return policy.allowFallback !== false;
          }

          if (action.type === "reinitialize") {
            return policy.allowReinitialize !== false;
          }

          if (action.type === "refresh-health") {
            return policy.allowHealthRefresh !== false;
          }

          if (action.type === "reset-circuit") {
            return policy.allowCircuitReset === true;
          }

          return true;
        })
        .sort((a, b) => a.priority - b.priority),
    );
  }

  public async recover(context: RecoveryContext): Promise<RecoveryResult> {
    const classification = this.classifier.classify({
      error: context.error,
      operationId: context.operationId,
      componentId: context.componentId,
      attempt: context.attempt,
    });

    if (classification.cancelled) {
      return Object.freeze({
        recovered: false,
        classification,
        error: context.error,
      });
    }

    const actions = this.getActions(context);

    for (const action of actions) {
      if (!action.execute) {
        continue;
      }

      if (context.signal?.aborted) {
        break;
      }

      try {
        await action.execute(context.signal);

        return Object.freeze({
          recovered: true,
          action,
          classification,
        });
      } catch (error) {
        // Continue to the next recovery action.
        // Recovery itself is allowed to fail without
        // hiding the original operation failure.
        void error;
      }
    }

    return Object.freeze({
      recovered: false,
      classification,
      error: context.error,
    });
  }
}

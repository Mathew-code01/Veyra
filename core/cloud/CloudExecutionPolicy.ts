import type { CloudRequest } from "./contracts/CloudRequest";
import { CloudError } from "./contracts/CloudError";

export type CloudModelCostClassification =
  "FREE_CONFIRMED" | "FREE_QUOTA_LIMITED" | "PAID" | "UNKNOWN" | "DISABLED";

export interface CloudModelCostPolicy {
  readonly classification: CloudModelCostClassification;
  readonly maxRequests?: number;
  readonly windowMs?: number;
}

export interface CloudQuotaLedger {
  reserve(
    providerId: string,
    modelId: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): boolean;
}

export interface CloudExecutionPolicyOptions {
  readonly externalProcessingAllowed?: boolean;
  readonly models?: Readonly<Record<string, CloudModelCostPolicy>>;
  readonly quotaLedger?: CloudQuotaLedger;
  readonly now?: () => number;
}

export function cloudModelPolicyKey(
  providerId: string,
  modelId: string,
): string {
  return JSON.stringify([providerId, modelId]);
}

export class CloudExecutionPolicy {
  private readonly externalProcessingAllowed: boolean;
  private readonly models: Readonly<Record<string, CloudModelCostPolicy>>;
  private readonly quotaLedger?: CloudQuotaLedger;
  private readonly now: () => number;

  public constructor(options: CloudExecutionPolicyOptions = {}) {
    this.externalProcessingAllowed = options.externalProcessingAllowed ?? false;
    this.models = Object.freeze({ ...(options.models ?? {}) });
    this.quotaLedger = options.quotaLedger;
    this.now = options.now ?? Date.now;
  }

  public authorize(providerId: string, request: CloudRequest): void {
    if (!this.externalProcessingAllowed) {
      throw this.denialError(
        providerId,
        request.model,
        "External processing is not authorized.",
      );
    }

    const modelId = request.model?.trim();
    if (!modelId) {
      throw this.denialError(
        providerId,
        undefined,
        "A model must be explicitly selected.",
      );
    }

    const modelPolicy = this.models[
      cloudModelPolicyKey(providerId, modelId)
    ] ?? { classification: "UNKNOWN" as const };

    switch (modelPolicy.classification) {
      case "FREE_CONFIRMED":
        return;

      case "FREE_QUOTA_LIMITED": {
        const { maxRequests, windowMs } = modelPolicy;
        if (
          typeof maxRequests !== "number" ||
          !Number.isSafeInteger(maxRequests) ||
          maxRequests <= 0 ||
          typeof windowMs !== "number" ||
          !Number.isFinite(windowMs) ||
          windowMs <= 0 ||
          !this.quotaLedger
        ) {
          throw this.denialError(
            providerId,
            modelId,
            "A valid quota limit and quota ledger are required.",
          );
        }

        try {
          const quotaLedger = this.quotaLedger;
          if (!quotaLedger) {
            throw this.denialError(
              providerId,
              modelId,
              "A valid quota limit and quota ledger are required.",
            );
          }

          if (
            !quotaLedger.reserve(
              providerId,
              modelId,
              maxRequests,
              windowMs,
              this.now(),
            )
          ) {
            throw this.denialError(
              providerId,
              modelId,
              "The configured free quota is exhausted.",
            );
          }
        } catch (error) {
          if (error instanceof CloudError) {
            throw error;
          }

          throw new CloudError(
            "Cloud quota authorization failed; the request was blocked.",
            "FORBIDDEN",
            {
              retryable: false,
              providerId,
              cause: error,
              details: { modelId, reason: "quota-ledger-failure" },
            },
          );
        }

        return;
      }

      case "PAID":
      case "UNKNOWN":
      case "DISABLED":
        throw this.denialError(
          providerId,
          modelId,
          `Model pricing classification "${modelPolicy.classification}" is not authorized.`,
        );

      default:
        throw this.denialError(
          providerId,
          modelId,
          "Unsupported model pricing classification is not authorized.",
        );
    }
  }

  private denialError(
    providerId: string,
    modelId: string | undefined,
    reason: string,
  ): CloudError {
    return new CloudError(reason, "FORBIDDEN", {
      retryable: false,
      providerId,
      details: {
        modelId,
        reason: "cloud-execution-policy-denied",
      },
    });
  }
}

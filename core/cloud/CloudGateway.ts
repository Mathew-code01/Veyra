
// ============================================================================
// FILE: core/cloud/CloudGateway.ts
//
// PURPOSE:
// Provider-neutral execution gateway for cloud operations.
//
// RESPONSIBILITIES:
// - Resolve the requested cloud provider.
// - Validate provider capabilities.
// - Execute cloud operations.
// - Expose cloud streaming.
// - Expose cloud health checks.
// - Connect cloud execution to Veyra's reliability subsystem.
//
// IMPORTANT RETRY BOUNDARY:
//
// CloudGateway does NOT blindly retry cloud operations.
//
// By default:
//   maxAttempts = 1
//
// This is intentional.
//
// AIExecutionStrategy already owns:
// - AI provider retries
// - retry limits
// - AI fallback
// - streaming retry safety
//
// Therefore an AI request travelling through:
//
//   AIExecutionStrategy
//       ↓
//   CloudAIProvider
//       ↓
//   CloudGateway
//
// gets one CloudGateway reliability attempt per AI attempt.
//
// Direct CloudGateway consumers may explicitly provide a RetryPolicy through
// CloudExecutionOptions.reliability when cloud-level retry is appropriate.
//
// STREAMING:
//
// CloudGateway does not pass streams through ReliabilityManager.execute().
// Doing so would require consuming the stream before returning it and would
// break streaming semantics.
//
// Streaming remains a direct provider stream with caller-provided
// cancellation/timeout options.
//
// ============================================================================

import type { CloudProviderRegistry } from "./CloudProviderRegistry";

import type {
  CloudRequest,
  CloudExecutionOptions,
} from "./contracts/CloudRequest";

import type { CloudResponse } from "./contracts/CloudResponse";

import type { CloudStream } from "./contracts/CloudStream";

import type { CloudHealth } from "./contracts/CloudHealth";

import { CloudError } from "./contracts/CloudError";

import {
  ReliabilityManager,
  type ReliabilityExecutionResult,
} from "../reliability";

// ============================================================================
// DEFAULT CLOUD RELIABILITY POLICY
// ============================================================================

/**
 * One reliability attempt is the safe default.
 *
 * This prevents CloudGateway from introducing a second retry layer underneath
 * AIExecutionStrategy.
 */
const DEFAULT_CLOUD_RELIABILITY_POLICY = Object.freeze({
  maxAttempts: 1,
});

// ============================================================================
// CLOUD GATEWAY
// ============================================================================

export class CloudGateway {
  private readonly reliabilityManager: ReliabilityManager;

  public constructor(
    private readonly registry: CloudProviderRegistry,

    reliabilityManager: ReliabilityManager = new ReliabilityManager(),
  ) {
    this.reliabilityManager = reliabilityManager;
  }

  // ========================================================================
  // EXECUTE
  // ========================================================================

  public async execute(
    providerId: string,
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    const provider = this.registry.tryGet(providerId);

    if (!provider) {
      throw new CloudError(
        `Cloud provider "${providerId}" is not registered.`,
        "NOT_FOUND",
        {
          retryable: false,
          providerId,
        },
      );
    }

    const retryPolicy =
      options.reliability?.retryPolicy ??
      DEFAULT_CLOUD_RELIABILITY_POLICY;

    const result = await this.reliabilityManager.execute<CloudResponse>(
      {
        componentId: `cloud.provider.${providerId}`,

        signal: options.signal,

        metadata: {
          providerId,

          operationType: request.type,

          ...options.metadata,
        },

        retryPolicy,

        timeoutMs: options.timeoutMs,

        recover: options.reliability?.recover,

        recovery: options.reliability?.recovery,
      },

      async () => {
        return provider.execute(request, options);
      },
    );

    return this.unwrapExecutionResult(result, providerId);
  }

  // ========================================================================
  // STREAM
  // ========================================================================

  public stream(
    providerId: string,
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    const provider = this.registry.tryGet(providerId);

    if (!provider) {
      throw new CloudError(
        `Cloud provider "${providerId}" is not registered.`,
        "NOT_FOUND",
        {
          retryable: false,
          providerId,
        },
      );
    }

    if (!provider.capabilities.streaming) {
      throw new CloudError(
        `Cloud provider "${providerId}" does not support streaming.`,
        "UNSUPPORTED",
        {
          retryable: false,
          providerId,
        },
      );
    }

    /**
     * Streaming intentionally does not use ReliabilityManager.execute().
     *
     * ReliabilityManager.execute() expects a Promise<T>, whereas CloudStream
     * is an ongoing async stream whose chunks must be delivered immediately.
     *
     * AIExecutionStrategy is the layer that owns streaming retry/fallback
     * safety. It will stop retrying/falling back after user-visible output
     * has been emitted.
     */
    return provider.stream(request, options);
  }

  // ========================================================================
  // HEALTH CHECK
  // ========================================================================

  public async healthCheck(providerId: string): Promise<CloudHealth>;

  public async healthCheck(): Promise<CloudHealth[]>;

  public async healthCheck(
    providerId?: string,
  ): Promise<CloudHealth | CloudHealth[]> {
    if (providerId) {
      const provider = this.registry.get(providerId);

      return provider.healthCheck();
    }

    const providers = this.registry.list();

    return Promise.all(
      providers.map((provider) => provider.healthCheck()),
    );
  }

  // ========================================================================
  // RESULT UNWRAPPING
  // ========================================================================

  private unwrapExecutionResult(
    result: ReliabilityExecutionResult<CloudResponse>,

    providerId: string,
  ): CloudResponse {
    if (result.succeeded) {
      return result.value;
    }

    /**
     * Reliability recovery may have succeeded without the original cloud
     * operation producing a CloudResponse.
     *
     * Do not fabricate a CloudResponse.
     *
     * Surface the original cloud/reliability failure instead.
     */
    if (result.error instanceof CloudError) {
      throw result.error;
    }

    if (result.error instanceof Error) {
      throw new CloudError(
        [
          `Cloud provider "${providerId}"`,
          `execution failed: ${result.error.message}`,
        ].join(" "),
        "UNKNOWN_ERROR",
        {
          retryable: false,
          providerId,
          cause: result.error,
          details: {
            recovered: result.recovered,
            retried: result.retried,
            operationId: result.operation.operationId,
          },
        },
      );
    }

    throw new CloudError(
      [
        `Cloud provider "${providerId}"`,
        `execution failed: ${String(result.error)}`,
      ].join(" "),
      "UNKNOWN_ERROR",
      {
        retryable: false,
        providerId,
        cause: result.error,
        details: {
          recovered: result.recovered,
          retried: result.retried,
          operationId: result.operation.operationId,
        },
      },
    );
  }
}

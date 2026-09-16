// ============================================================================
// FILE: core/cloud/CloudGateway.ts
// PURPOSE:
// Single execution gateway for cloud providers.
//
// IMPORTANT:
// Gateway executes requests against explicitly selected providers.
// It does NOT contain interview logic or decide what information
// is relevant to the candidate/interview.
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

// ============================================================================
// CLOUD GATEWAY
// ============================================================================

export class CloudGateway {
  public constructor(private readonly registry: CloudProviderRegistry) {}

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

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

    return provider.execute(request, options);
  }

  // ==========================================================================
  // STREAM
  // ==========================================================================

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

    return provider.stream(request, options);
  }

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  /**
   * Check one explicitly selected provider.
   *
   * Supplying providerId guarantees a single CloudHealth result.
   */
  public async healthCheck(providerId: string): Promise<CloudHealth>;

  /**
   * Check every registered provider.
   */
  public async healthCheck(): Promise<CloudHealth[]>;

  /**
   * Implementation for both overloads.
   */
  public async healthCheck(
    providerId?: string,
  ): Promise<CloudHealth | CloudHealth[]> {
    // ------------------------------------------------------------------------
    // SINGLE PROVIDER
    // ------------------------------------------------------------------------

    if (providerId) {
      const provider = this.registry.get(providerId);

      return provider.healthCheck();
    }

    // ------------------------------------------------------------------------
    // ALL PROVIDERS
    // ------------------------------------------------------------------------

    const providers = this.registry.list();

    return Promise.all(providers.map((provider) => provider.healthCheck()));
  }
}

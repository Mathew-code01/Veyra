// ============================================================================
// FILE: core/cloud/CloudProvider.ts
// PURPOSE:
// Canonical interface implemented by every remote provider.
// ============================================================================

import type { CloudCapabilities } from "./CloudCapabilities";

import type { CloudModel } from "./CloudModel";

import type {
  CloudRequest,
  CloudExecutionOptions,
} from "./contracts/CloudRequest";

import type { CloudResponse } from "./contracts/CloudResponse";

import type { CloudStream } from "./contracts/CloudStream";

import type { CloudHealth } from "./contracts/CloudHealth";

import type { CloudProviderConfig } from "./CloudProviderConfig";

export interface CloudProvider {
  /**
   * Stable provider identifier.
   *
   * Example:
   * gemini
   */
  readonly id: string;

  /**
   * Human-readable provider name.
   */
  readonly name: string;

  /**
   * Runtime configuration.
   */
  readonly config: CloudProviderConfig;

  /**
   * Supported provider capabilities.
   */
  readonly capabilities: CloudCapabilities;

  /**
   * Provider's known model catalogue.
   */
  readonly models: readonly CloudModel[];

  /**
   * Execute a non-streaming request.
   */
  execute(
    request: CloudRequest,
    options?: CloudExecutionOptions,
  ): Promise<CloudResponse>;

  /**
   * Execute a streaming request.
   */
  stream(request: CloudRequest, options?: CloudExecutionOptions): CloudStream;

  /**
   * Check provider availability/authentication.
   */
  healthCheck(signal?: AbortSignal): Promise<CloudHealth>;
}

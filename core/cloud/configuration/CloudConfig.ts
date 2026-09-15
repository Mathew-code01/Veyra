// ============================================================================
// FILE: core/cloud/configuration/CloudConfig.ts
// PURPOSE:
// Global cloud configuration.
//
// NOTE:
// This class knows provider configuration.
// It does NOT choose which provider should answer an AI request.
// ============================================================================

import type { CloudProviderConfig } from "../CloudProviderConfig";

import {
  resolveCloudEnvironment,
  type CloudEnvironment,
} from "./CloudEnvironment";

export interface CloudGlobalConfig {
  readonly environment: CloudEnvironment;

  readonly enabled: boolean;

  readonly defaultTimeoutMs: number;

  readonly providers: readonly CloudProviderConfig[];
}

export class CloudConfig {
  private readonly config: CloudGlobalConfig;

  public constructor(config: Partial<CloudGlobalConfig> = {}) {
    this.config = Object.freeze({
      environment:
        config.environment ?? resolveCloudEnvironment(process.env.NODE_ENV),

      enabled: config.enabled ?? true,

      defaultTimeoutMs: config.defaultTimeoutMs ?? 30_000,

      providers: Object.freeze([...(config.providers ?? [])]),
    });
  }

  public get environment(): CloudEnvironment {
    return this.config.environment;
  }

  public get enabled(): boolean {
    return this.config.enabled;
  }

  public get defaultTimeoutMs(): number {
    return this.config.defaultTimeoutMs;
  }

  public get providers(): readonly CloudProviderConfig[] {
    return this.config.providers;
  }

  public getProvider(providerId: string): CloudProviderConfig | undefined {
    return this.providers.find((provider) => provider.id === providerId);
  }
}

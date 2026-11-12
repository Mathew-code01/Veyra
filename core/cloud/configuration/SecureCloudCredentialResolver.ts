// ============================================================================
// FILE: core/cloud/configuration/SecureCloudCredentialResolver.ts
//
// PURPOSE:
// Cloud credential resolver that supports Bring-Your-Own-API-Key (BYOK)
// through OS-backed secure storage, with environment variables as a fallback.
//
// RESOLUTION ORDER:
//   1. OS-backed secure storage (Electron safeStorage) for the active profile
//      and provider. This is the BYOK path.
//   2. The credential's own source (e.g. environment variable). Preserves
//      existing behavior for users who configure keys via environment
//      variables.
//
// SECURITY:
// - The active profile is resolved from trusted main-process state; the
//   resolver never trusts a renderer-supplied profile.
// - No raw secret is logged or returned through renderer IPC.
// - Fails closed when secure storage is unavailable.
// ============================================================================

import type {
  CloudCredential,
  CloudCredentialResolver,
} from "../CloudCredential";

import { SecureCredentialStore } from "../../security/SecureCredentialStore";

export interface SecureCloudCredentialResolverOptions {
  readonly credentialStore: SecureCredentialStore;

  /**
   * Trusted active-profile getter from main-process application state.
   */
  readonly getActiveProfileId: () => string | undefined;
}

export class SecureCloudCredentialResolver implements CloudCredentialResolver {
  private readonly credentialStore: SecureCredentialStore;

  private readonly getActiveProfileId: () => string | undefined;

  public constructor(options: SecureCloudCredentialResolverOptions) {
    this.credentialStore = options.credentialStore;

    this.getActiveProfileId = options.getActiveProfileId;
  }

  public async resolve(
    credential: CloudCredential,
  ): Promise<string | undefined> {
    if (!credential || !credential.enabled) {
      return undefined;
    }

    // ------------------------------------------------------------------
    // 1. OS-backed secure storage (BYOK). Always checked for the provider
    //    so a stored BYOK key takes precedence over environment variables.
    // ------------------------------------------------------------------
    const profileId = this.getActiveProfileId();

    if (profileId) {
      const secret = await this.credentialStore.getDecryptedCredential(
        profileId,
        credential.providerId,
      );

      if (secret) {
        return secret;
      }
    }

    // ------------------------------------------------------------------
    // 2. Delegate to the credential's declared source (environment,
    //    process, etc.). Preserves existing env-var-based configuration.
    // ------------------------------------------------------------------
    if (
      credential.source === "environment" ||

      credential.source === "process"
    ) {
      const reference = credential.reference?.trim();

      if (reference) {
        const value = process.env[reference];

        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
    }

    return undefined;
  }
}

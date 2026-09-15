// ============================================================================
// FILE: core/cloud/configuration/CloudCredentials.ts
// PURPOSE:
// Credential resolution without exposing secrets to provider registries.
// ============================================================================

import type {
  CloudCredential,
  CloudCredentialResolver,
} from "../CloudCredential";

import { CloudError } from "../contracts/CloudError";

export class EnvironmentCloudCredentialResolver implements CloudCredentialResolver {
  public async resolve(
    credential: CloudCredential,
  ): Promise<string | undefined> {
    if (!credential.enabled) {
      return undefined;
    }

    if (credential.source !== "environment") {
      throw new CloudError(
        `Credential source "${credential.source}" is not supported by the environment resolver.`,
        "CONFIGURATION",
        {
          retryable: false,
          providerId: credential.providerId,
        },
      );
    }

    const value = process.env[credential.reference];

    if (!value) {
      return undefined;
    }

    return value;
  }
}

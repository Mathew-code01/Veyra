// ============================================================================
// FILE: core/cloud/CloudCredential.ts
// PURPOSE:
// Secure credential references for cloud providers.
//
// SECURITY:
// This file must NEVER contain actual API key values.
// ============================================================================

export type CloudCredentialSource =
  | "environment"
  | "process"
  | "secret_manager"
  | "os_keychain"
  | "runtime"
  | "custom";

export type CloudCredentialKind =
  | "api_key"
  | "bearer_token"
  | "oauth_access_token"
  | "service_account"
  | "custom";

export interface CloudCredential {
  /**
   * Stable internal credential identifier.
   */
  readonly id: string;

  /**
   * Provider this credential belongs to.
   */
  readonly providerId: string;

  /**
   * Credential type.
   */
  readonly kind: CloudCredentialKind;

  /**
   * Where the secret is resolved from.
   */
  readonly source: CloudCredentialSource;

  /**
   * Environment variable name or external secret reference.
   *
   * Example:
   * GEMINI_API_KEY
   *
   * This is a reference, NOT the actual secret.
   */
  readonly reference: string;

  /**
   * Whether this credential is enabled.
   */
  readonly enabled: boolean;

  /**
   * Optional metadata.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CloudCredentialResolver {
  resolve(credential: CloudCredential): Promise<string | undefined>;
}

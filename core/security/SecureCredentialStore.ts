// ============================================================================
// FILE: core/security/SecureCredentialStore.ts
//
// PURPOSE:
// Secure BYOK credential store.
//
// API keys are encrypted with OS-backed secure storage (CredentialVault) and
// only the ciphertext is persisted in SQLite. The raw secret is decrypted
// inside the trusted main process and is never returned through renderer IPC.
//
// SECURITY:
// - No raw API key is persisted in plaintext in SQLite.
// - No raw API key is returned through IPC to the renderer.
// - Fail closed when secure storage is unavailable.
// - No hardcoded encryption key inside the application.
// ============================================================================

import type { CredentialVault } from "./credentialVault";
import { ProviderCredentialRepository } from "../../database/repositories/providerCredentialRepository";

export interface CredentialStatus {
  readonly providerId: string;
  readonly configured: boolean;
  /**
   * Masked representation safe to show in the UI. Never the raw secret.
   */
  readonly maskedKey?: string;
}

export interface SecureCredentialStoreDependencies {
  readonly vault: CredentialVault;

  readonly repository: ProviderCredentialRepository;
}

export class SecureCredentialStore {
  private readonly vault: CredentialVault;

  private readonly repository: ProviderCredentialRepository;

  public constructor(dependencies: SecureCredentialStoreDependencies) {
    this.vault = dependencies.vault;

    this.repository = dependencies.repository;
  }

  public isSecureStorageAvailable(): boolean {
    return this.vault.isAvailable();
  }

  public async storeCredential(
    profileId: string,
    providerId: string,
    secret: string,
  ): Promise<void> {
    if (!profileId || !providerId) {
      throw new Error("A profile id and provider id are required.");
    }

    if (!secret || !secret.trim()) {
      throw new Error("A secret is required.");
    }

    if (!this.vault.isAvailable()) {
      throw new Error("OS-backed secure storage is not available on this platform.");
    }

    const encrypted = await this.vault.encrypt(secret.trim());

    this.repository.save({
      id: `cred-${profileId}-${providerId}`,
      profileId,
      providerId,
      encryptedCredential: encrypted,
    });
  }

  public async getDecryptedCredential(
    profileId: string,
    providerId: string,
  ): Promise<string | undefined> {
    if (!profileId || !providerId) {
      return undefined;
    }

    if (!this.vault.isAvailable()) {
      return undefined;
    }

    const row = this.repository.getByProfileAndProvider(profileId, providerId);

    if (!row) {
      return undefined;
    }

    return this.vault.decrypt(row.encryptedCredential);
  }

  public getCredentialStatus(
    profileId: string,
    providerId: string,
  ): CredentialStatus {
    const row = this.repository.getByProfileAndProvider(profileId, providerId);

    if (!row) {
      return { providerId, configured: false };
    }

    return {
      providerId,

      configured: true,

      maskedKey: this.maskCredential(),
    };
  }

  public deleteCredential(profileId: string, providerId: string): boolean {
    if (!profileId || !providerId) {
      return false;
    }

    return this.repository.removeByProfileAndProvider(profileId, providerId);
  }

  public listConfiguredProviders(profileId: string): readonly string[] {
    if (!profileId) {
      return Object.freeze([]);
    }

    return Object.freeze(
      this.repository.listByProfile(profileId).map((row) => row.providerId),
    );
  }

  private maskCredential(): string {
    return "****";
  }
}

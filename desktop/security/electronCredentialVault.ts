// ============================================================================
// FILE: desktop/security/electronCredentialVault.ts
//
// PURPOSE:
// Electron-backed credential vault using `safeStorage` and the operating
// system's native credential protection (Windows Credential Manager, macOS
// Keychain, GNOME Keyring / libsecret on Linux).
//
// NO raw secret is ever persisted in plaintext. Only ciphertext produced by
// `safeStorage` is stored in SQLite, associated with a profile and provider.
//
// PLATFORM NOTES:
// - Windows: uses DPAPI / Credential Manager.
// - macOS: uses Keychain.
// - Linux: uses libsecret / GNOME Keyring.
// - If encryption is unavailable, `isAvailable()` returns false and the
//   application must fail closed (no plaintext fallback).
// ============================================================================

import { safeStorage } from "electron";

import type { CredentialVault } from "../../core/security/credentialVault";

interface SafeStorageApi {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend(): string;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export class ElectronCredentialVault implements CredentialVault {
  public constructor(
    private readonly storage: SafeStorageApi = safeStorage,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {}

  public isAvailable(): boolean {
    if (!this.storage.isEncryptionAvailable()) {
      return false;
    }

    if (this.platform === "linux") {
      const backend = this.storage.getSelectedStorageBackend();
      return (
        backend !== "basic_text" &&
        backend !== "unknown"
      );
    }

    return true;
  }

  public async encrypt(plaintext: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("OS-backed secure storage is not available on this platform.");
    }

    const encrypted = this.storage.encryptString(plaintext);

    return encrypted.toString("base64");
  }

  public async decrypt(ciphertext: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error("OS-backed secure storage is not available on this platform.");
    }

    const buffer = Buffer.from(ciphertext, "base64");

    return this.storage.decryptString(buffer);
  }
}

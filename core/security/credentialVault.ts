// ============================================================================
// FILE: core/security/credentialVault.ts
//
// PURPOSE:
// Abstraction over operating-system-backed secure storage.
//
// Electron's `safeStorage` (and the underlying OS keychain/credential manager)
// is only available in the main process and only when running inside Electron.
// This interface lets the rest of the application encrypt/decrypt secrets
// without importing Electron directly, and without hardcoding any encryption
// key inside the application.
//
// IMPLEMENTATION NOTE:
//   - Production: ElectronCredentialVault delegates to `safeStorage`.
//   - Tests / non-Electron: a test vault (or in-memory vault) is substituted.
//   - No raw secret is ever persisted in plaintext.
// ============================================================================

export interface CredentialVault {
  /**
   * Encrypts a plaintext secret into a ciphertext string suitable for storage.
   */
  encrypt(plaintext: string): Promise<string>;

  /**
   * Decrypts a ciphertext string back into the plaintext secret.
   */
  decrypt(ciphertext: string): Promise<string>;

  /**
   * Whether secure storage is available on the current platform.
   */
  isAvailable(): boolean;
}

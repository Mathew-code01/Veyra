import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { SecureCredentialStore } from "../../../core/security/SecureCredentialStore";

import type { CredentialVault } from "../../../core/security/credentialVault";

import { ProviderCredentialRepository } from "../../../database/repositories/providerCredentialRepository";

import { createTestDatabase, destroyTestDatabase, getTestDatabase } from "../../../tests/helpers/database";

function makeVault(available = true): CredentialVault & { encrypted: Map<string, string> } {
  const store = new Map<string, string>();

  return Object.assign(
    {
      encrypt: vi.fn(async (plaintext: string) => {
        const cipher = `enc:${plaintext}`;

        store.set(plaintext, cipher);

        return cipher;
      }),

      decrypt: vi.fn(async (ciphertext: string) => {
        if (!ciphertext.startsWith("enc:")) {
          throw new Error("Invalid ciphertext.");
        }

        return ciphertext.slice(4);
      }),

      isAvailable: vi.fn(() => available),

      _store: store,
    },
  ) as CredentialVault & { encrypted: Map<string, string> };
}

function makeRepository() {
  return new ProviderCredentialRepository();
}

describe("SecureCredentialStore", () => {
  let dbPath: string;

  let vault: ReturnType<typeof makeVault>;

  let repository: ProviderCredentialRepository;

  let store: SecureCredentialStore;

  beforeEach(async () => {
    dbPath = await createTestDatabase();

    vault = makeVault();

    repository = makeRepository();

    store = new SecureCredentialStore({ vault, repository });

    getTestDatabase()
      .sqlite.prepare(
        "INSERT OR IGNORE INTO profiles (id, display_name, email, created_at, updated_at) VALUES ('profile-1', 'Profile One', 'one@example.com', 'now', 'now'), ('profile-2', 'Profile Two', 'two@example.com', 'now', 'now')",
      )
      .run();
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    await destroyTestDatabase(dbPath);
  });

  it("reports secure storage availability", () => {
    expect(store.isSecureStorageAvailable()).toBe(true);

    const unavailableStore = new SecureCredentialStore({
      vault: makeVault(false),

      repository: makeRepository(),
    });

    expect(unavailableStore.isSecureStorageAvailable()).toBe(false);
  });

  it("stores only ciphertext, never the raw secret", async () => {
    await store.storeCredential("profile-1", "gemini", "super-secret-key");

    expect(vault.encrypt).toHaveBeenCalledWith("super-secret-key");

    const row = repository.getByProfileAndProvider("profile-1", "gemini");

    expect(row).toBeDefined();

    if (row) {
      expect(row.encryptedCredential).toBe("enc:super-secret-key");
      expect(row.encryptedCredential).not.toBe("super-secret-key");
    }
  });

  it("decrypts and returns the secret for main-process use", async () => {
    await store.storeCredential("profile-1", "gemini", "super-secret-key");

    const secret = await store.getDecryptedCredential("profile-1", "gemini");

    expect(secret).toBe("super-secret-key");

    expect(vault.decrypt).toHaveBeenCalledWith("enc:super-secret-key");
  });

  it("returns undefined when no credential is stored", async () => {
    const secret = await store.getDecryptedCredential("profile-1", "gemini");

    expect(secret).toBeUndefined();
  });

  it("reports credential status without exposing the raw secret", async () => {
    const before = store.getCredentialStatus("profile-1", "gemini");

    expect(before.configured).toBe(false);
    expect(before.maskedKey).toBeUndefined();

    await store.storeCredential("profile-1", "gemini", "abcdef1234567890");

    const after = store.getCredentialStatus("profile-1", "gemini");

    expect(after.configured).toBe(true);
    expect(after.maskedKey).toBeDefined();
    expect(after.maskedKey).not.toContain("abcdef1234567890");
    expect(after.maskedKey).toMatch(/^\*\*\*/);
  });

  it("deletes a stored credential", async () => {
    await store.storeCredential("profile-1", "gemini", "secret-key");

    expect(store.getCredentialStatus("profile-1", "gemini").configured).toBe(
      true,
    );

    const deleted = store.deleteCredential("profile-1", "gemini");

    expect(deleted).toBe(true);
    expect(store.getCredentialStatus("profile-1", "gemini").configured).toBe(
      false,
    );
  });

  it("fails closed when secure storage is unavailable", async () => {
    const unavailableStore = new SecureCredentialStore({
      vault: makeVault(false),

      repository: makeRepository(),
    });

    await expect(
      unavailableStore.storeCredential("profile-1", "gemini", "key"),
    ).rejects.toThrow(/secure storage is not available/);

    const secret = await unavailableStore.getDecryptedCredential(
      "profile-1",
      "gemini",
    );

    expect(secret).toBeUndefined();
  });

  it("isolates credentials by profile and provider", async () => {
    await store.storeCredential("profile-1", "gemini", "key-a");
    await store.storeCredential("profile-2", "gemini", "key-b");
    await store.storeCredential("profile-1", "groq", "key-c");

    expect(store.getDecryptedCredential("profile-1", "gemini")).resolves.toBe(
      "key-a",
    );

    expect(store.getDecryptedCredential("profile-2", "gemini")).resolves.toBe(
      "key-b",
    );

    expect(store.getDecryptedCredential("profile-1", "groq")).resolves.toBe(
      "key-c",
    );
  });
});

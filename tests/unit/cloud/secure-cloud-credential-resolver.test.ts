import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { SecureCloudCredentialResolver } from "../../../core/cloud/configuration/SecureCloudCredentialResolver";

import { SecureCredentialStore } from "../../../core/security/SecureCredentialStore";

import type { CredentialVault } from "../../../core/security/credentialVault";

import { ProviderCredentialRepository } from "../../../database/repositories/providerCredentialRepository";

import {
  createTestDatabase,

  destroyTestDatabase,

  getTestDatabase,
} from "../../../tests/helpers/database";

function makeVault(): CredentialVault {
  return {
    encrypt: vi.fn(async (plaintext: string) => `enc:${plaintext}`),

    decrypt: vi.fn(async (ciphertext: string) => {
      if (!ciphertext.startsWith("enc:")) {
        throw new Error("Invalid ciphertext.");
      }

      return ciphertext.slice(4);
    }),

    isAvailable: vi.fn(() => true),
  };
}

function makeStore() {
  const vault = makeVault();

  const repository = new ProviderCredentialRepository();

  return { vault, store: new SecureCredentialStore({ vault, repository }) };
}

describe("SecureCloudCredentialResolver", () => {
  let activeProfileId: string | undefined = "profile-1";

  let resolver: SecureCloudCredentialResolver;

  let dbPath: string;

  beforeEach(async () => {
    activeProfileId = "profile-1";

    dbPath = await createTestDatabase();

    getTestDatabase()
      .sqlite.prepare(
        "INSERT OR IGNORE INTO profiles (id, display_name, email, created_at, updated_at) VALUES ('profile-1', 'Profile One', 'one@example.com', 'now', 'now')",
      )
      .run();

    const { store } = makeStore();

    resolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => activeProfileId,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    delete process.env.GEMINI_API_KEY;

    await destroyTestDatabase(dbPath);
  });

  it("resolves a BYOK key from OS-backed secure storage", async () => {
    const { vault, store } = makeStore();

    await store.storeCredential("profile-1", "gemini", "byok-gemini-key");

    const byokResolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => activeProfileId,
    });

    const credential = {
      id: "gemini-os-keychain",

      providerId: "gemini",

      kind: "api_key" as const,

      source: "os_keychain" as const,

      reference: "gemini",

      enabled: true,
    };

    const secret = await byokResolver.resolve(credential);

    expect(secret).toBe("byok-gemini-key");

    expect(vault.decrypt).toHaveBeenCalled();
  });

  it("returns undefined when no active profile is set", async () => {
    const { store } = makeStore();

    const noProfileResolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => undefined,
    });

    const credential = {
      id: "gemini-os-keychain",

      providerId: "gemini",

      kind: "api_key" as const,

      source: "os_keychain" as const,

      reference: "gemini",

      enabled: true,
    };

    const secret = await noProfileResolver.resolve(credential);

    expect(secret).toBeUndefined();
  });

  it("falls back to environment variables when no BYOK key is stored", async () => {
    const { store } = makeStore();

    const envResolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => activeProfileId,
    });

    process.env.GEMINI_API_KEY = "env-gemini-key";

    const credential = {
      id: "gemini-environment",

      providerId: "gemini",

      kind: "api_key" as const,

      source: "environment" as const,

      reference: "GEMINI_API_KEY",

      enabled: true,
    };

    const secret = await envResolver.resolve(credential);

    expect(secret).toBe("env-gemini-key");
  });

  it("prefers the BYOK key over the environment variable", async () => {
    const { vault, store } = makeStore();

    await store.storeCredential("profile-1", "gemini", "byok-key");

    process.env.GEMINI_API_KEY = "env-key";

    const byokResolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => activeProfileId,
    });

    const credential = {
      id: "gemini-os-keychain",

      providerId: "gemini",

      kind: "api_key" as const,

      source: "os_keychain" as const,

      reference: "gemini",

      enabled: true,
    };

    const secret = await byokResolver.resolve(credential);

    expect(secret).toBe("byok-key");

    expect(vault.decrypt).toHaveBeenCalled();
  });

  it("returns undefined for a disabled credential", async () => {
    const { store } = makeStore();

    const disabledResolver = new SecureCloudCredentialResolver({
      credentialStore: store,

      getActiveProfileId: () => activeProfileId,
    });

    const credential = {
      id: "gemini-environment",

      providerId: "gemini",

      kind: "api_key" as const,

      source: "environment" as const,

      reference: "GEMINI_API_KEY",

      enabled: false,
    };

    const secret = await disabledResolver.resolve(credential);

    expect(secret).toBeUndefined();
  });
});

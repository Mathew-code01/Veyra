import { describe, expect, it } from "vitest";

import { DataSanitizer } from "../../../core/security/DataSanitizer";
import { Encryption } from "../../../core/security/Encryption";
import { SecretsManager } from "../../../core/security/SecretsManager";
import { SecureDelete } from "../../../core/security/SecureDelete";

const inMemoryStore = () => {
  const entries = new Map<string, { value: string; metadata?: Record<string, unknown> }>();

  return {
    async get(key: string) {
      return entries.get(key)?.value ?? null;
    },
    async set(key: string, value: string, metadata?: Record<string, unknown>) {
      entries.set(key, { value, metadata });
    },
    async delete(key: string) {
      entries.delete(key);
    },
    async has(key: string) {
      return entries.has(key);
    },
    async clear() {
      entries.clear();
    },
    async listKeys() {
      return [...entries.keys()];
    },
  };
};

describe("security utilities", () => {
  it("encrypts and decrypts data with authenticated encryption", async () => {
    const encryption = new Encryption();
    const salt = encryption.createSalt();
    const key = await encryption.deriveKey("super-secret-password", salt);
    const payload = await encryption.encrypt("hello, vault", key);
    const recovered = await encryption.decrypt(payload, key);

    expect(recovered).toBe("hello, vault");
    expect(payload.algorithm).toBe("AES-256-GCM");
  });

  it("rejects tampered ciphertext", async () => {
    const encryption = new Encryption();
    const salt = encryption.createSalt();
    const key = await encryption.deriveKey("password", salt);
    const payload = await encryption.encrypt("top secret", key);

    const tampered = {
      ...payload,
      ciphertext:
        payload.ciphertext.slice(0, -1) +
        (payload.ciphertext.at(-1) === "A" ? "B" : "A"),
    };

    await expect(encryption.decrypt(tampered, key)).rejects.toThrow();
  });

  it("redacts sensitive values before logging or serialization", () => {
    const sanitizer = new DataSanitizer({ mode: "strict" });
    const message =
      "Token=abc123 and password=supersecret and email=test@example.com";

    const sanitized = sanitizer.sanitize(message);

    expect(sanitized.text).not.toContain("supersecret");
    expect(sanitized.text).not.toContain("test@example.com");
    expect(sanitized.text).toContain("[REDACTED]");
  });

  it("stores secrets in a scoped namespace and rejects invalid keys", async () => {
    const manager = new SecretsManager({
      store: inMemoryStore(),
      namespace: "veyra-tests",
    });

    await manager.set("provider.api.key", "secret-value");

    await expect(manager.require("provider.api.key")).resolves.toBe("secret-value");
    await expect(manager.get("unknown")).resolves.toBeNull();

    await manager.delete("provider.api.key");
    await expect(manager.has("provider.api.key")).resolves.toBe(false);
    await expect(manager.set("bad key", "value")).rejects.toThrow();
  });

  it("supports secure deletion without throwing on missing targets", async () => {
    const secureDelete = new SecureDelete({ overwritePasses: 1 });

    await expect(
      secureDelete.remove(
        { path: "./missing-file.txt" },
        {
          exists: async () => false,
          remove: async () => undefined,
          overwrite: async () => undefined,
        },
      ),
    ).resolves.toBeUndefined();
  });
});

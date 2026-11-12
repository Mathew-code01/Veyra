import { describe, expect, it, vi } from "vitest";

import { ElectronCredentialVault } from "../../../desktop/security/electronCredentialVault";

function fakeStorage(backend: string, available = true) {
  return {
    isEncryptionAvailable: vi.fn(() => available),
    getSelectedStorageBackend: vi.fn(() => backend),
    encryptString: vi.fn((value: string) => Buffer.from(`encrypted:${value}`)),
    decryptString: vi.fn((value: Buffer) =>
      value.toString().replace(/^encrypted:/, ""),
    ),
  };
}

describe("ElectronCredentialVault", () => {
  it("rejects Linux basic_text and unknown storage backends", () => {
    expect(
      new ElectronCredentialVault(fakeStorage("basic_text"), "linux").isAvailable(),
    ).toBe(false);
    expect(
      new ElectronCredentialVault(fakeStorage("unknown"), "linux").isAvailable(),
    ).toBe(false);
  });

  it("allows recognized OS-backed Linux and Windows storage", () => {
    expect(
      new ElectronCredentialVault(
        fakeStorage("gnome_libsecret"),
        "linux",
      ).isAvailable(),
    ).toBe(true);
    expect(
      new ElectronCredentialVault(fakeStorage("unknown"), "win32").isAvailable(),
    ).toBe(true);
  });

  it("round-trips ciphertext and fails closed when encryption is unavailable", async () => {
    const storage = fakeStorage("gnome_libsecret");
    const vault = new ElectronCredentialVault(storage, "linux");

    const ciphertext = await vault.encrypt("secret");
    expect(ciphertext).not.toContain("secret");
    await expect(vault.decrypt(ciphertext)).resolves.toBe("secret");

    const unavailable = new ElectronCredentialVault(
      fakeStorage("gnome_libsecret", false),
      "linux",
    );
    expect(unavailable.isAvailable()).toBe(false);
    await expect(unavailable.encrypt("secret")).rejects.toThrow(
      "OS-backed secure storage is not available",
    );
  });
});

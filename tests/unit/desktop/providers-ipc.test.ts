import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { registerProvidersIpc } from "../../../desktop/ipc/providers.ipc";

import type { IpcMain } from "electron";

import type { SecureCredentialStore } from "../../../core/security/SecureCredentialStore";

import { ProviderSettingsRepository } from "../../../database/repositories/providerSettingsRepository";

import type { CloudProvider } from "../../../core/cloud/CloudProvider";

import { CloudProviderRegistry } from "../../../core/cloud/CloudProviderRegistry";

import type { CloudExecutionPolicy } from "../../../core/cloud/CloudExecutionPolicy";

import type { ActiveProfileResolver } from "../../../desktop/main/activeProfile";

import { IPC_CHANNELS } from "../../../shared/constants/events";

function makeSender(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
  };
}

function makeIpcMain(): IpcMain {
  return {
    handle: vi.fn(),

    removeHandler: vi.fn(),
  } as unknown as IpcMain;
}

function handlerMap(ipcMain: IpcMain): Map<string, unknown> {
  const map = new Map<string, unknown>();

  const handle = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;

  for (const call of handle.mock.calls) {
    map.set(call[0], call[1]);
  }

  return map;
}

function makeCredentialStore(): SecureCredentialStore & {
  getCredentialStatus: ReturnType<typeof vi.fn>;
  storeCredential: ReturnType<typeof vi.fn>;
  deleteCredential: ReturnType<typeof vi.fn>;
  getDecryptedCredential: ReturnType<typeof vi.fn>;
} {
  return {
    getCredentialStatus: vi.fn(() => ({
      configured: false,

      maskedKey: undefined,
    })),

    storeCredential: vi.fn(async () => undefined),

    deleteCredential: vi.fn(() => true),

    getDecryptedCredential: vi.fn(async () => undefined),
  } as unknown as SecureCredentialStore & {
    getCredentialStatus: ReturnType<typeof vi.fn>;
    storeCredential: ReturnType<typeof vi.fn>;
    deleteCredential: ReturnType<typeof vi.fn>;
    getDecryptedCredential: ReturnType<typeof vi.fn>;
  };
}

function makeSettingsRepository() {
  return {
    get: vi.fn(() => undefined),

    save: vi.fn(),
  } as unknown as ProviderSettingsRepository;
}

function makeProvider(
  id: string,

  name: string,

  models: Array<{
    readonly modelId: string;

    readonly displayName: string;

    readonly capabilities: Record<string, boolean>;
  }> = [],
): CloudProvider {
  return {
    id,

    name,

    capabilities: {
      text: true,

      streaming: true,

      vision: false,

      embeddings: false,

    },

    models: Object.freeze(models),

    healthCheck: vi.fn(async () => ({
      status: "healthy" as const,

      latencyMs: 42,

      error: undefined,
    })),

  } as unknown as CloudProvider;
}

function makeActiveProfileResolver(profileId: string | undefined): ActiveProfileResolver {
  return {
    getActiveProfile: vi.fn(() => profileId),

    hasActiveProfile: vi.fn(() => profileId !== undefined),
  };
}

describe("registerProvidersIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers all provider settings handlers", () => {
    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handlers = handlerMap(ipcMain);

    expect(handlers.has(IPC_CHANNELS.PROVIDERS_GET_STATUS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_DELETE_CREDENTIAL)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_LIST_MODELS)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE)).toBe(true);
  });

  it("get-status returns provider status without raw secrets", async () => {
    const credentialStore = makeCredentialStore();

    credentialStore.getCredentialStatus.mockImplementation(
      (profileId: string, providerId: string) => ({
        configured: providerId === "gemini",

        maskedKey: providerId === "gemini" ? "****1234" : undefined,
      }),
    );

    const registry = new CloudProviderRegistry();

    registry.register(makeProvider("gemini", "Google Gemini", []));

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore,

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: registry,

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_GET_STATUS,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(true);

    if (result.success) {
      const providers = result.data.providers;

      expect(providers.length).toBe(1);

      const gemini = providers[0];

      expect(gemini.providerId).toBe("gemini");

      expect(gemini.configured).toBe(true);

      expect(gemini.maskedKey).toBe("****1234");

      // Raw secret must never be present.
      expect(gemini).not.toHaveProperty("secret");
      expect(JSON.stringify(gemini)).not.toContain("super-secret");
    }
  });

  it("get-status fails closed when no active profile", async () => {
    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver(undefined),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_GET_STATUS,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler({ sender: makeSender() }, undefined);

    expect(result.success).toBe(false);
  });

  it("save-credential stores without returning the raw secret", async () => {
    const credentialStore = makeCredentialStore();

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore,

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { providerId: "gemini", secret: "super-secret-key" },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.configured).toBe(true);
    }

    expect(credentialStore.storeCredential).toHaveBeenCalledWith(
      "profile-1",

      "gemini",

      "super-secret-key",
    );

    // The raw secret must not be in the response.
    expect(JSON.stringify(result)).not.toContain("super-secret-key");
  });

  it("save-credential fails closed when no active profile", async () => {
    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver(undefined),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { providerId: "gemini", secret: "key" },
    );

    expect(result.success).toBe(false);
  });

  it("verify-credential performs a health check only (no inference)", async () => {
    const credentialStore = makeCredentialStore();

    credentialStore.getCredentialStatus.mockReturnValue({ configured: true });

    const provider = makeProvider("gemini", "Google Gemini");

    const registry = new CloudProviderRegistry();

    registry.register(provider);

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore,

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: registry,

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { providerId: "gemini" },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.verified).toBe(true);
      expect(result.data.status).toBe("healthy");
    }

    expect(provider.healthCheck).toHaveBeenCalled();

    // No raw secret in response.
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("verify-credential reports not configured when no key stored", async () => {
    const credentialStore = makeCredentialStore();

    credentialStore.getCredentialStatus.mockReturnValue({
      configured: false,

      maskedKey: undefined,
    });

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore,

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { providerId: "gemini" },
    );

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.verified).toBe(false);
      expect(result.data.status).toBe("unavailable");
    }
  });

  it("set-preferred-model persists the model selection", async () => {
    const settingsRepository = makeSettingsRepository();

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository,

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { providerId: "gemini", modelId: "gemini-2.5-flash" },
    );

    expect(result.success).toBe(true);

    expect(settingsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",

        providerId: "gemini",

        preferredModel: "gemini-2.5-flash",
      }),
    );
  });

  it("set-execution-mode persists the mode", async () => {
    const settingsRepository = makeSettingsRepository();

    const ipcMain = makeIpcMain();

    registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository,

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    const handler = handlerMap(ipcMain).get(
      IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE,
    ) as (event: unknown, request?: unknown) => unknown;

    const result = await handler(
      { sender: makeSender() },

      { mode: "hybrid" },
    );

    expect(result.success).toBe(true);

    expect(settingsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",

        providerId: "__execution_mode__",

        executionMode: "hybrid",
      }),
    );
  });

  it("cleanup removes the registered handlers", () => {
    const ipcMain = makeIpcMain();

    const cleanup = registerProvidersIpc({
      credentialStore: makeCredentialStore(),

      settingsRepository: makeSettingsRepository(),

      cloudRegistry: new CloudProviderRegistry(),

      cloudExecutionPolicy: {} as unknown as CloudExecutionPolicy,

      aiManager: {} as never,

      activeProfileResolver: makeActiveProfileResolver("profile-1"),

      ipcMain,
    });

    cleanup();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_GET_STATUS,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_DELETE_CREDENTIAL,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_LIST_MODELS,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL,
    );
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(
      IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE,
    );
  });
});

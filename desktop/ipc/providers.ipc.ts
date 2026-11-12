// ============================================================================
// FILE: desktop/ipc/providers.ipc.ts
//
// PURPOSE:
// Backend handlers for the Veyra AI provider settings (BYOK) UI.
//
// MAIN PROCESS ONLY.
//
// SECURITY:
// - No raw API key is ever returned through IPC.
// - `providers:verify-credential` performs a provider health check only;
//   it never issues a generation/inference request.
// - All profile scope comes from the trusted active-profile resolver;
//   renderer-supplied profile IDs are never used for authorization.
// ============================================================================

import type { IpcMain, IpcMainInvokeEvent } from "electron";

import type { AIManager } from "../../core/ai/AIManager";

import type { CloudProvider } from "../../core/cloud/CloudProvider";

import type { CloudExecutionPolicy } from "../../core/cloud/CloudExecutionPolicy";

import type { CloudProviderRegistry } from "../../core/cloud/CloudProviderRegistry";

import type { SecureCredentialStore } from "../../core/security/SecureCredentialStore";

import type { ActiveProfileResolver } from "../main/activeProfile";

import { ProviderSettingsRepository } from "../../database/repositories/providerSettingsRepository";

import type { AiExecutionMode } from "../../database/schema/providerSettings";

import { IPC_CHANNELS } from "../../shared/constants/events";

import type { Result } from "../../shared/types/common";

// ============================================================================
// TYPES
// ============================================================================

export interface ModelInfo {
  readonly modelId: string;

  readonly displayName: string;

  readonly classification:
    | "FREE_CONFIRMED"
    | "FREE_QUOTA_LIMITED"
    | "PAID"
    | "UNKNOWN"
    | "DISABLED";

  readonly capabilities: Record<string, boolean>;
}

export interface ProviderStatus {
  readonly providerId: string;

  readonly name: string;

  readonly configured: boolean;

  readonly maskedKey?: string;

  readonly capabilities: Record<string, boolean>;

  readonly models: readonly ModelInfo[];

  readonly preferredModel: string | null;

  readonly executionMode: AiExecutionMode;
}

export interface ProvidersGetStatusResult {
  readonly executionMode: AiExecutionMode;

  readonly providers: readonly ProviderStatus[];
}

export interface ProvidersSaveCredentialRequest {
  readonly providerId: string;

  readonly secret: string;
}

export interface ProvidersSaveCredentialResult {
  readonly providerId: string;

  readonly configured: boolean;
}

export interface ProvidersDeleteCredentialResult {
  readonly providerId: string;

  readonly deleted: boolean;
}

export interface ProvidersVerifyCredentialRequest {
  readonly providerId: string;
}

export interface ProvidersVerifyCredentialResult {
  readonly providerId: string;

  readonly verified: boolean;

  readonly status: "healthy" | "degraded" | "unavailable";

  readonly error?: string;

  readonly latencyMs?: number;
}

export interface ProvidersListModelsRequest {
  readonly providerId: string;
}

export interface ProvidersListModelsResult {
  readonly providerId: string;

  readonly models: readonly ModelInfo[];
}

export interface ProvidersSetPreferredModelRequest {
  readonly providerId: string;

  readonly modelId: string;
}

export interface ProvidersSetExecutionModeRequest {
  readonly mode: AiExecutionMode;
}

export interface RegisterProvidersIpcOptions {
  readonly credentialStore: SecureCredentialStore;

  readonly settingsRepository: ProviderSettingsRepository;

  readonly cloudRegistry: CloudProviderRegistry;

  readonly cloudExecutionPolicy: CloudExecutionPolicy;

  readonly aiManager: AIManager;

  readonly activeProfileResolver: ActiveProfileResolver;

  readonly ipcMain: IpcMain;
}

const APP_SETTINGS_PROVIDER_ID = "__execution_mode__";

function assertValidIpcSender(event: IpcMainInvokeEvent): void {
  if (event.sender.isDestroyed()) {
    throw new Error("Veyra IPC request rejected: sender is no longer available.");
  }
}

function requestObject(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

function assertExecutionMode(value: unknown): AiExecutionMode {
  if (
    value === "local-only" ||

    value === "cloud-only" ||

    value === "hybrid"
  ) {
    return value;
  }

  throw new Error(
    `Invalid execution mode: ${String(value)}.`,
  );
}

// ============================================================================
// REGISTRATION
// ============================================================================

export function registerProvidersIpc(
  options: RegisterProvidersIpcOptions,
): () => void {
  const credentialStore = options.credentialStore;

  const settingsRepository = options.settingsRepository;

  const cloudRegistry = options.cloudRegistry;

  const cloudExecutionPolicy = options.cloudExecutionPolicy;

  const aiManager = options.aiManager;

  const activeProfileResolver = options.activeProfileResolver;

  const ipcMain = options.ipcMain;

  // ------------------------------------------------------------------
  // PROVIDERS_GET_STATUS
  // ------------------------------------------------------------------
  const getStatusHandler = async (
    event: IpcMainInvokeEvent,
    _request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProvidersGetStatusResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    const modeSetting = settingsRepository.get(
      profileId,

      APP_SETTINGS_PROVIDER_ID,
    );

    const executionMode: AiExecutionMode = modeSetting?.executionMode ?? "local-only";

    const providers: ProviderStatus[] = [];

    for (const provider of cloudRegistry.list()) {
      const status = credentialStore.getCredentialStatus(
        profileId,

        provider.id,
      );

      const modelSetting = settingsRepository.get(
        profileId,

        provider.id,
      );

      const models: ModelInfo[] = (provider.models ?? []).map((model) => ({
        modelId: model.modelId,

        displayName: model.displayName,

        classification: "UNKNOWN" as const,

        capabilities: {
          text: model.capabilities?.textGeneration ?? false,

          streaming: model.capabilities?.streaming ?? false,

          vision: model.capabilities?.vision ?? false,

          embeddings: model.capabilities?.embeddings ?? false,

        },
      }));

      providers.push({
        providerId: provider.id,

        name: provider.name,

        configured: status.configured,

        maskedKey: status.maskedKey,

        capabilities: {
          text: provider.capabilities?.textGeneration ?? false,

          streaming: provider.capabilities?.streaming ?? false,

          vision: provider.capabilities?.vision ?? false,

          embeddings: provider.capabilities?.embeddings ?? false,

        },

        models,

        preferredModel: modelSetting?.preferredModel ?? null,

        executionMode,
      });
    }

    return {
      success: true,

      data: {
        executionMode,

        providers: Object.freeze(providers),
      },
    };
  };

  // ------------------------------------------------------------------
  // PROVIDERS_SAVE_CREDENTIAL
  // ------------------------------------------------------------------
  const saveCredentialHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProvidersSaveCredentialResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as unknown as ProvidersSaveCredentialRequest;

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    if (!payload.providerId?.trim()) {
      return {
        success: false,

        error: new Error("A provider id is required."),
      };
    }

    if (!payload.secret || !payload.secret.trim()) {
      return {
        success: false,

        error: new Error("A secret is required."),
      };
    }

    try {
      await credentialStore.storeCredential(
        profileId,

        payload.providerId.trim(),

        payload.secret.trim(),
      );

      return {
        success: true,

        data: {
          providerId: payload.providerId.trim(),

          configured: true,
        },
      };
    } catch (error) {
      return {
        success: false,

        error:
          error instanceof Error

            ? error

            : new Error("Failed to store credential."),
      };
    }
  };

  // ------------------------------------------------------------------
  // PROVIDERS_DELETE_CREDENTIAL
  // ------------------------------------------------------------------
  const deleteCredentialHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProvidersDeleteCredentialResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as { readonly providerId?: string };

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    if (!payload.providerId?.trim()) {
      return {
        success: false,

        error: new Error("A provider id is required."),
      };
    }

    const deleted = credentialStore.deleteCredential(
      profileId,

      payload.providerId.trim(),
    );

    return {
      success: true,

      data: {
        providerId: payload.providerId.trim(),

        deleted,
      },
    };
  };

  // ------------------------------------------------------------------
  // PROVIDERS_VERIFY_CREDENTIAL
  //
  // Health check only. No generation/inference request is issued, so no
  // inference quota is consumed and no paid call is made.
  // ------------------------------------------------------------------
  const verifyCredentialHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProvidersVerifyCredentialResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as unknown as ProvidersVerifyCredentialRequest;

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    if (!payload.providerId?.trim()) {
      return {
        success: false,

        error: new Error("A provider id is required."),
      };
    }

    const providerId = payload.providerId.trim();

    const configured = credentialStore.getCredentialStatus(
      profileId,

      providerId,
    ).configured;

    if (!configured) {
      return {
        success: true,

        data: {
          providerId,

          verified: false,

          status: "unavailable",

          error: "No credential is stored for this provider.",
        },
      };
    }

    const provider = cloudRegistry.tryGet(providerId);

    if (!provider) {
      return {
        success: false,

        error: new Error(`Provider "${providerId}" is not registered.`),
      };
    }

    const startedAt = Date.now();

    try {
      const health = await provider.healthCheck();

      return {
        success: true,

        data: {
          providerId,

          verified: health.status === "healthy",

          status:
            health.status === "healthy"

              ? "healthy"

              : health.status === "degraded"

              ? "degraded"

              : "unavailable",

          latencyMs: health.latencyMs,

          error: health.error,
        },
      };
    } catch (error) {
      return {
        success: true,

        data: {
          providerId,

          verified: false,

          status: "unavailable",

          error:
            error instanceof Error

              ? error.message

              : "Provider verification failed.",

          latencyMs: Date.now() - startedAt,
        },
      };
    }
  };

  // ------------------------------------------------------------------
  // PROVIDERS_LIST_MODELS
  // ------------------------------------------------------------------
  const listModelsHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly data?: ProvidersListModelsResult;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as unknown as ProvidersListModelsRequest;

    if (!payload.providerId?.trim()) {
      return {
        success: false,

        error: new Error("A provider id is required."),
      };
    }

    const providerId = payload.providerId.trim();

    const provider = cloudRegistry.tryGet(providerId);

    if (!provider) {
      return {
        success: false,

        error: new Error(`Provider "${providerId}" is not registered.`),
      };
    }

    return {
      success: true,

      data: {
        providerId,

        models: Object.freeze(
          (provider.models ?? []).map((model) => ({
            modelId: model.modelId,

            displayName: model.displayName,

            classification: "UNKNOWN" as const,

            capabilities: {
              text: model.capabilities?.textGeneration ?? false,

              streaming: model.capabilities?.streaming ?? false,

              vision: model.capabilities?.vision ?? false,

              embeddings: model.capabilities?.embeddings ?? false,

            },
          })),
        ),
      },
    };
  };

  // ------------------------------------------------------------------
  // PROVIDERS_SET_PREFERRED_MODEL
  // ------------------------------------------------------------------
  const setPreferredModelHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as unknown as ProvidersSetPreferredModelRequest;

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    if (!payload.providerId?.trim()) {
      return {
        success: false,

        error: new Error("A provider id is required."),
      };
    }

    if (!payload.modelId?.trim()) {
      return {
        success: false,

        error: new Error("A model id is required."),
      };
    }

    const existing = settingsRepository.get(
      profileId,

      payload.providerId.trim(),
    );

    settingsRepository.save({
      id: `setting-${profileId}-${payload.providerId.trim()}`,

      profileId,

      providerId: payload.providerId.trim(),

      preferredModel: payload.modelId.trim(),

      executionMode: existing?.executionMode ?? "local-only",
    });

    return { success: true };
  };

  // ------------------------------------------------------------------
  // PROVIDERS_SET_EXECUTION_MODE
  // ------------------------------------------------------------------
  const setExecutionModeHandler = async (
    event: IpcMainInvokeEvent,

    request?: unknown,
  ): Promise<{
    readonly success: boolean;

    readonly error?: Error;
  }> => {
    assertValidIpcSender(event);

    const payload = requestObject(request) as unknown as ProvidersSetExecutionModeRequest;

    const profileId = activeProfileResolver.getActiveProfile();

    if (!profileId) {
      return {
        success: false,

        error: new Error("No active profile."),
      };
    }

    const mode = assertExecutionMode(payload.mode);

    const existing = settingsRepository.get(
      profileId,

      APP_SETTINGS_PROVIDER_ID,
    );

    settingsRepository.save({
      id: `setting-${profileId}-${APP_SETTINGS_PROVIDER_ID}`,

      profileId,

      providerId: APP_SETTINGS_PROVIDER_ID,

      preferredModel: null,

      executionMode: mode,
    });

    return { success: true };
  };

  // ------------------------------------------------------------------
  // HANDLER REGISTRATION
  // ------------------------------------------------------------------
  ipcMain.handle(IPC_CHANNELS.PROVIDERS_GET_STATUS, getStatusHandler);

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL, saveCredentialHandler);

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_DELETE_CREDENTIAL,

    deleteCredentialHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL,

    verifyCredentialHandler,
  );

  ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST_MODELS, listModelsHandler);

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL,

    setPreferredModelHandler,
  );

  ipcMain.handle(
    IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE,

    setExecutionModeHandler,
  );

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_GET_STATUS);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_SAVE_CREDENTIAL);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_DELETE_CREDENTIAL);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_VERIFY_CREDENTIAL);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_LIST_MODELS);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_SET_PREFERRED_MODEL);

    ipcMain.removeHandler(IPC_CHANNELS.PROVIDERS_SET_EXECUTION_MODE);
  };
}

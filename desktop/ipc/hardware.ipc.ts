// Relative path: desktop/ipc/hardware.ipc.ts

/**
 * Veyra Hardware IPC
 *
 * Location:
 * desktop/ipc/hardware.ipc.ts
 *
 * MAIN PROCESS ONLY.
 *
 * Renderer requests are limited to:
 *
 *   1. Get cached hardware profile
 *   2. Refresh hardware profile
 *   3. Get hardware-aware model plan
 *
 * The renderer never receives HardwareProfiler or
 * ModelManager instances.
 *
 * Security:
 * - IPC handlers validate their sender state.
 * - Request payloads are treated as untrusted input.
 * - Only the supported `forceRefresh` property is read.
 * - No Node.js objects are exposed to the renderer.
 */

import {
  ipcMain,
  type IpcMain,
  type IpcMainInvokeEvent,
} from "electron";

import {
  HARDWARE_IPC_CHANNELS,
  type HardwareGetModelPlanRequest,
  type HardwareGetProfileRequest,
} from "../../shared/contracts/hardware.contract";

import type {
  HardwareModelPlanResponse,
  HardwareSnapshotResponse,
  HardwareAssessmentResponse,
  ModelInstallProgress,
} from "../../shared/types/hardware";

import { HardwareService } from "../services/ai/HardwareService";

export interface RegisterHardwareIpcOptions {
  readonly service: HardwareService;
  readonly ipcMain?: IpcMain;
}

/**
 * Safely converts unknown IPC input into an object.
 *
 * IPC arguments originate from the renderer and must
 * always be considered untrusted.
 */
function assertRequestObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  return value as Record<string, unknown>;
}

/**
 * Reads the only supported request property.
 *
 * Only the literal boolean `true` enables force refresh.
 * Everything else resolves to false.
 */
function parseForceRefresh(
  value: unknown,
): boolean {
  const request = assertRequestObject(value);

  return request.forceRefresh === true;
}

/**
 * Validates the IPC sender before processing a request.
 *
 * Electron guarantees that an IpcMainInvokeEvent has a
 * sender, but the sender may have been destroyed by the
 * time asynchronous work begins.
 *
 * This check also gives us a legitimate use of the
 * required Electron IPC event parameter.
 */
function assertValidIpcSender(
  event: IpcMainInvokeEvent,
): void {
  if (event.sender.isDestroyed()) {
    throw new Error(
      "Veyra IPC request rejected: sender is no longer available.",
    );
  }
}

/**
 * Registers hardware IPC handlers.
 *
 * Returns a cleanup function for:
 * - tests
 * - controlled Electron lifecycle management
 * - application shutdown
 */
export function registerHardwareIpc(
  options: RegisterHardwareIpcOptions,
): () => void {
  const service = options.service;
  const main = options.ipcMain ?? ipcMain;
  const installs = new Map<string, AbortController>();

  /**
   * GET_PROFILE
   *
   * Electron handler signature:
   *
   *   (event, request)
   *
   * The event MUST be the first parameter.
   */
  const getProfileHandler = async (
    event: IpcMainInvokeEvent,
    request?: HardwareGetProfileRequest,
  ): Promise<HardwareSnapshotResponse> => {
    assertValidIpcSender(event);

    const forceRefresh = parseForceRefresh(request);

    return service.getSnapshot(forceRefresh);
  };

  /**
   * REFRESH_PROFILE
   */
  const refreshProfileHandler = async (
    event: IpcMainInvokeEvent,
  ): Promise<HardwareSnapshotResponse> => {
    assertValidIpcSender(event);

    return service.getSnapshot(true);
  };

  /**
   * GET_MODEL_PLAN
   */
  const getModelPlanHandler = async (
    event: IpcMainInvokeEvent,
    request?: HardwareGetModelPlanRequest,
  ): Promise<HardwareModelPlanResponse> => {
    assertValidIpcSender(event);

    const forceRefresh = parseForceRefresh(request);

    const result =
      await service.getSafeModelPlan(forceRefresh);

    return Object.freeze({
      profile: result.profile,
      plan: result.plan,
    });
  };

  const getAssessmentHandler = async (event: IpcMainInvokeEvent, request?: unknown): Promise<HardwareAssessmentResponse> => {
    assertValidIpcSender(event);
    return service.getAssessment(parseForceRefresh(request));
  };
  const installModelHandler = async (event: IpcMainInvokeEvent, request: unknown): Promise<{ readonly installed: boolean }> => {
    assertValidIpcSender(event);
    const input = assertRequestObject(request);
    const modelId = typeof input.modelId === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(input.modelId) ? input.modelId : "";
    if (!modelId) throw new Error("Choose a valid model from the VEYRA catalogue.");
    const manager = service.getModelManager();
    if (installs.has(modelId)) throw new Error("This model is already being installed.");
    const definition = manager.getModel(modelId);
    if (definition.availability !== "available" || !definition.package || !definition.package.artifacts.length || definition.package.artifacts.some((artifact) => !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || !/^[a-f0-9]{64}$/i.test(artifact.sha256))) {
      throw new Error("This model does not have a verified install package.");
    }
    const current = await service.getProfile();
    const compatibility = manager.evaluateModel(modelId, current);
    if (compatibility.level === "incompatible") throw new Error(compatibility.blockingReasons.join(" ") || "This model is not compatible with this computer.");
    const controller = new AbortController();
    installs.set(modelId, controller);
    try {
    await manager.install(modelId, { requireMemorySafety: true, signal: controller.signal, onProgress: (progress) => {
      if (event.sender.isDestroyed()) return;
      const safe: ModelInstallProgress = { modelId: progress.modelId, filename: progress.filename, bytesDownloaded: progress.bytesDownloaded, totalBytes: progress.totalBytes, percentage: progress.percentage, speedBytesPerSecond: progress.speedBytesPerSecond, phase: progress.phase };
      event.sender.send(HARDWARE_IPC_CHANNELS.INSTALL_PROGRESS, safe);
    }});
    return Object.freeze({ installed: manager.isInstalled(modelId) });
    } finally { installs.delete(modelId); }
  };
  const cancelInstallHandler = async (event: IpcMainInvokeEvent, request: unknown): Promise<{ readonly cancelled: boolean }> => {
    assertValidIpcSender(event);
    const input = assertRequestObject(request);
    const controller = typeof input.modelId === "string" ? installs.get(input.modelId) : undefined;
    if (!controller) return Object.freeze({ cancelled: false });
    controller.abort();
    return Object.freeze({ cancelled: true });
  };
  const uninstallModelHandler = async (event: IpcMainInvokeEvent, request: unknown): Promise<{ readonly removed: boolean }> => {
    assertValidIpcSender(event);
    const input = assertRequestObject(request);
    if (typeof input.modelId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(input.modelId)) throw new Error("Choose a valid model from the VEYRA catalogue.");
    await service.getModelManager().uninstall(input.modelId);
    return Object.freeze({ removed: !service.getModelManager().isInstalled(input.modelId) });
  };

  /**
   * Register handlers.
   */
  main.handle(
    HARDWARE_IPC_CHANNELS.GET_PROFILE,
    getProfileHandler,
  );

  main.handle(
    HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    refreshProfileHandler,
  );

  main.handle(
    HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
    getModelPlanHandler,
  );
  main.handle(HARDWARE_IPC_CHANNELS.GET_ASSESSMENT, getAssessmentHandler);
  main.handle(HARDWARE_IPC_CHANNELS.INSTALL_MODEL, installModelHandler);
  main.handle(HARDWARE_IPC_CHANNELS.UNINSTALL_MODEL, uninstallModelHandler);
  main.handle(HARDWARE_IPC_CHANNELS.CANCEL_INSTALL, cancelInstallHandler);

  /**
   * Cleanup.
   *
   * Useful for tests and controlled application
   * lifecycle management.
   */
  return () => {
    main.removeHandler(
      HARDWARE_IPC_CHANNELS.GET_PROFILE,
    );

    main.removeHandler(
      HARDWARE_IPC_CHANNELS.REFRESH_PROFILE,
    );

    main.removeHandler(
      HARDWARE_IPC_CHANNELS.GET_MODEL_PLAN,
    );
    main.removeHandler(HARDWARE_IPC_CHANNELS.GET_ASSESSMENT);
    main.removeHandler(HARDWARE_IPC_CHANNELS.INSTALL_MODEL);
    main.removeHandler(HARDWARE_IPC_CHANNELS.UNINSTALL_MODEL);
    main.removeHandler(HARDWARE_IPC_CHANNELS.CANCEL_INSTALL);
    for (const controller of installs.values()) controller.abort();
    installs.clear();
  };
}

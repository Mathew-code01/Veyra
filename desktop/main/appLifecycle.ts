// desktop/main/appLifecycle.ts

import { app } from "electron";

import { ModelSystem } from "./ModelSystem";

import { HardwareService } from "../services/ai/HardwareService";

import { registerHardwareIpc } from "../ipc/hardware.ipc";

let initialized = false;

let modelSystem: ModelSystem | null = null;

let hardwareService: HardwareService | null = null;

let cleanupHardwareIpc: (() => void) | null = null;

export async function initializeApplication(): Promise<void> {
  if (initialized) {
    return;
  }

  configureApplication();

  await initializeApplicationServices();

  initialized = true;
}

export async function shutdownApplication(): Promise<void> {
  if (!initialized) {
    return;
  }

  try {
    await shutdownApplicationServices();
  } catch (error) {
    console.error("[Veyra] Application shutdown encountered an error.", error);
  } finally {
    initialized = false;
  }
}

export function getModelSystem(): ModelSystem {
  if (!modelSystem) {
    throw new Error("Veyra ModelSystem has not been initialized.");
  }

  return modelSystem;
}

export function getHardwareService(): HardwareService {
  if (!hardwareService) {
    throw new Error("Veyra HardwareService has not been initialized.");
  }

  return hardwareService;
}

function configureApplication(): void {
  app.setName("Veyra");

  if (process.platform === "win32") {
    app.setAppUserModelId("com.veyra.desktop");
  }
}

async function initializeApplicationServices(): Promise<void> {
  /*
   * --------------------------------------------------------------------------
   * 1. Create the single application ModelSystem.
   * --------------------------------------------------------------------------
   */
  const system = new ModelSystem({
    applicationDataDirectory: app.getPath("userData"),
  });

  /*
   * --------------------------------------------------------------------------
   * 2. Initialize model infrastructure.
   * --------------------------------------------------------------------------
   *
   * This does NOT download a model.
   *
   * It only initializes storage, queue state,
   * recovery and already-installed verified models.
   */
  await system.initialize();

  modelSystem = system;

  /*
   * --------------------------------------------------------------------------
   * 3. Create HardwareService using the SAME ModelManager.
   * --------------------------------------------------------------------------
   */
  const hardware = new HardwareService({
    modelManager: system.getModelManager(),
  });

  hardwareService = hardware;

  /*
   * --------------------------------------------------------------------------
   * 4. Register hardware IPC.
   * --------------------------------------------------------------------------
   */
  cleanupHardwareIpc = registerHardwareIpc({
    service: hardware,
  });
}

async function shutdownApplicationServices(): Promise<void> {
  /*
   * --------------------------------------------------------------------------
   * 1. Remove IPC handlers.
   * --------------------------------------------------------------------------
   */
  if (cleanupHardwareIpc) {
    cleanupHardwareIpc();

    cleanupHardwareIpc = null;
  }

  /*
   * --------------------------------------------------------------------------
   * 2. Dispose the model system.
   * --------------------------------------------------------------------------
   */
  if (modelSystem) {
    try {
      await modelSystem.dispose();
    } finally {
      modelSystem = null;
    }
  }

  hardwareService = null;
}

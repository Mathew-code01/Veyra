// desktop/main/appLifecycle.ts

import { app } from "electron";

import { AIManager } from "../../core/ai/AIManager";

import { createDefaultCloudProviderRegistry } from "../../core/cloud/registry/defaultCloudProviders";

import { InterviewIntelligence } from "../../core/interview/services/InterviewIntelligence";

import { PromptService } from "../../core/prompts/services/PromptService";

import { ReliabilityManager } from "../../core/reliability";

import { ModelSystem } from "./ModelSystem";

import { HardwareService } from "../services/ai/HardwareService";

import { registerHardwareIpc } from "../ipc/hardware.ipc";

let initialized = false;

let modelSystem: ModelSystem | null = null;

let hardwareService: HardwareService | null = null;

let aiManager: AIManager | null = null;

let interviewIntelligence: InterviewIntelligence | null = null;

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

export function getAIManager(): AIManager {
  if (!aiManager) {
    throw new Error("Veyra AIManager has not been initialized.");
  }

  return aiManager;
}

export function getInterviewIntelligence(): InterviewIntelligence {
  if (!interviewIntelligence) {
    throw new Error("Veyra InterviewIntelligence has not been initialized.");
  }

  return interviewIntelligence;
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
   * 3. Create a shared reliability manager for AI and interview operations.
   * --------------------------------------------------------------------------
   */
  const reliabilityManager = new ReliabilityManager();

  /*
   * --------------------------------------------------------------------------
   * 4. Create the AI runtime composition root.
   * --------------------------------------------------------------------------
   */
  const runtimeAIManager = new AIManager({
    manager: reliabilityManager,
    timeoutMs: 30_000,
    recover: true,
  });

  runtimeAIManager.registerLocalModelProvider(system.getModelManager(), {
    name: "local",
    autoInstall: false,
  });

  const cloudRegistry = createDefaultCloudProviderRegistry({
    allowUnconfigured: false,
  });

  for (const provider of cloudRegistry.list()) {
    runtimeAIManager.registerCloudAIProviderFromRegistry(cloudRegistry, {
      providerId: provider.id,
      name: provider.name,
      replaceExisting: true,
    });
  }

  aiManager = runtimeAIManager;

  const promptService = new PromptService();

  interviewIntelligence = new InterviewIntelligence({
    promptService,
    reliabilityManager,
  });

  /*
   * --------------------------------------------------------------------------
   * 5. Create HardwareService using the SAME ModelManager.
   * --------------------------------------------------------------------------
   */
  const hardware = new HardwareService({
    modelManager: system.getModelManager(),
  });

  hardwareService = hardware;

  /*
   * --------------------------------------------------------------------------
   * 6. Register hardware IPC.
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

  aiManager = null;
  interviewIntelligence = null;
  hardwareService = null;
}

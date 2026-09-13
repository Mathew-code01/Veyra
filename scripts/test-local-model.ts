// scripts/test-local-model.ts


/// <reference types="node" />

/**
 * ============================================================================
 * VEYRA — REAL LOCAL MODEL INTEGRATION TEST
 * ============================================================================
 *
 * This test exercises Veyra's real local-model architecture.
 *
 * Pipeline:
 *
 *   HardwareProfiler
 *        ↓
 *   ModelManager
 *        ↓
 *   ModelSelector
 *        ↓
 *   ModelRegistry
 *        ↓
 *   ModelCompatibility
 *        ↓
 *   ModelInstallationManager
 *        ↓
 *   ModelPackageDownloader
 *        ↓
 *   ModelStorage / Manifest / Integrity
 *        ↓
 *   RuntimePackageRegistry
 *        ↓
 *   RuntimeDownloader
 *        ↓
 *   RuntimeInstaller
 *        ↓
 *   LlamaRuntimeLocator
 *        ↓
 *   RuntimeRegistry
 *        ↓
 *   ModelRuntimeManager
 *        ↓
 *   LlamaCppRuntime
 *        ↓
 *   REAL INFERENCE
 *
 * IMPORTANT
 * ----------
 * This test does NOT use Ollama.
 *
 * It deliberately uses Veyra's own model and runtime infrastructure.
 *
 * Runtime binaries are NOT expected inside the Git repository.
 *
 * They are automatically installed into:
 *
 *   %LOCALAPPDATA%\Veyra\runtimes\
 *
 * and reused on subsequent runs.
 * ============================================================================
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { HardwareProfiler } from "../core/hardware/HardwareProfiler";

import type { HardwareProfile } from "../core/hardware/HardwareProfile";

import {
  defaultModelRegistry,
  type ModelDefinition,
} from "../core/models/ModelRegistry";

import { ModelManager } from "../core/models/ModelManager";

import { ModelDownloadQueue } from "../core/models/installation/ModelDownloadQueue";

import { ModelInstallationManager } from "../core/models/installation/ModelInstallationManager";

import { ModelStorage } from "../core/models/storage/ModelStorage";

import { ModelPaths } from "../core/models/storage/ModelPaths";

import { ModelRuntimeManager } from "../core/models/runtime/ModelRuntimeManager";

import { RuntimeRegistry } from "../core/models/runtime/RuntimeRegistry";

import { LlamaCppRuntime } from "../core/models/runtime/LlamaCppRuntime";

import { RuntimeInstaller } from "../core/models/runtime/RuntimeInstaller";

import { LlamaRuntimeLocator } from "../core/models/runtime/LlamaRuntimeLocator";

import type { ModelRuntimeHealth } from "../core/models/runtime/ModelRuntime";

/**
 * ============================================================================
 * Configuration
 * ============================================================================
 */

const TEST_MODEL_ID = process.env.VEYRA_TEST_MODEL_ID?.trim() || "";

const TEST_PROMPT = "Respond with exactly: VEYRA_LOCAL_TEST_OK";

const EXPECTED_RESPONSE = "VEYRA_LOCAL_TEST_OK";

const RUNTIME_HOST =
  process.env.VEYRA_LLAMA_HOST?.trim() || "127.0.0.1";

const RUNTIME_PORT = parsePositiveInteger(
  process.env.VEYRA_LLAMA_PORT,
  39271,
);

const STARTUP_TIMEOUT_MS = parsePositiveInteger(
  process.env.VEYRA_LLAMA_STARTUP_TIMEOUT_MS,
  60_000,
);

const MODEL_ROOT =
  process.env.VEYRA_MODEL_DATA_DIR?.trim() ||
  path.join(
    process.env.LOCALAPPDATA ||
      path.join(os.homedir(), "AppData", "Local"),
    "Veyra",
  );

/**
 * ============================================================================
 * Types
 * ============================================================================
 */

type StageState = "pending" | "running" | "passed" | "failed";

interface StageRecord {
  readonly number: number;
  readonly name: string;
  readonly state: StageState;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly errorCode?: string;
  readonly reason?: string;
}

interface PipelineState {
  hardwareProfile: HardwareProfile | null;

  selectedModel: ModelDefinition | null;

  modelManager: ModelManager | null;

  paths: ModelPaths | null;

  storage: ModelStorage | null;

  queue: ModelDownloadQueue | null;

  installationManager: ModelInstallationManager | null;

  runtimeManager: ModelRuntimeManager | null;

  runtimeRegistry: RuntimeRegistry | null;

  runtimeInstaller: RuntimeInstaller | null;

  runtimeLocator: LlamaRuntimeLocator | null;

  runtime: LlamaCppRuntime | null;

  runtimeExecutable: string | null;

  loaded: boolean;

  inferenceAttempted: boolean;

  inferencePassed: boolean;
}

/**
 * ============================================================================
 * Runtime state
 * ============================================================================
 */

const pipeline: PipelineState = {
  hardwareProfile: null,

  selectedModel: null,

  modelManager: null,

  paths: null,

  storage: null,

  queue: null,

  installationManager: null,

  runtimeManager: null,

  runtimeRegistry: null,

  runtimeInstaller: null,

  runtimeLocator: null,

  runtime: null,

  runtimeExecutable: null,

  loaded: false,

  inferenceAttempted: false,

  inferencePassed: false,
};

const stages: StageRecord[] = [];

const testStartedAt = Date.now();

/**
 * ============================================================================
 * Formatting
 * ============================================================================
 */

const WIDTH = 62;

function line(character = "─"): string {
  return character.repeat(WIDTH);
}

function title(message: string): void {
  console.log("");
  console.log(`╔${"═".repeat(WIDTH)}╗`);

  const safeMessage =
    message.length > WIDTH ? message.slice(0, WIDTH) : message;

  const leftPadding = Math.floor(
    (WIDTH - safeMessage.length) / 2,
  );

  const rightPadding =
    WIDTH - safeMessage.length - leftPadding;

  console.log(
    `║${" ".repeat(leftPadding)}${safeMessage}${" ".repeat(
      rightPadding,
    )}║`,
  );

  console.log(`╚${"═".repeat(WIDTH)}╝`);
  console.log("");
}

function section(message: string): void {
  console.log("");
  console.log(line());
  console.log(message);
  console.log(line());
}

function info(message: string): void {
  console.log(`      ${message}`);
}

function success(message: string): void {
  console.log(`      ✓ ${message}`);
}

function progress(message: string): void {
  console.log(`      → ${message}`);
}

function formatBytes(
  bytes: number | null | undefined,
): string {
  if (bytes === null || bytes === undefined) {
    return "unknown";
  }

  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KiB", "MiB", "GiB", "TiB"];

  let value = bytes;
  let index = -1;

  while (
    value >= 1024 &&
    index < units.length - 1
  ) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 100 ? 0 : 2)} ${
    units[index]
  }`;
}

function formatDuration(
  milliseconds: number | null | undefined,
): string {
  if (
    milliseconds === null ||
    milliseconds === undefined ||
    !Number.isFinite(milliseconds)
  ) {
    return "unknown";
  }

  if (milliseconds < 1000) {
    return `${Math.max(
      0,
      Math.round(milliseconds),
    )} ms`;
  }

  return `${(
    Math.max(0, milliseconds) / 1000
  ).toFixed(2)} s`;
}

function formatPercentage(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "N/A";
  }

  return `${Math.max(
    0,
    Math.min(100, value),
  ).toFixed(1)}%`;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
}

/**
 * ============================================================================
 * Error handling
 * ============================================================================
 */

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function errorCode(error: unknown): string {
  const message = errorMessage(error).toLowerCase();

  if (
    message.includes("download") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("econnreset") ||
    message.includes("enotfound")
  ) {
    return "RUNTIME_OR_MODEL_DOWNLOAD_FAILED";
  }

  if (
    message.includes("sha") ||
    message.includes("checksum") ||
    message.includes("integrity") ||
    message.includes("corrupt")
  ) {
    return "INTEGRITY_VERIFICATION_FAILED";
  }

  if (message.includes("manifest")) {
    return "MANIFEST_VERIFICATION_FAILED";
  }

  if (
    message.includes("runtime") ||
    message.includes("llama") ||
    message.includes("executable") ||
    message.includes("server")
  ) {
    return "RUNTIME_INITIALIZATION_FAILED";
  }

  if (
    message.includes("memory") ||
    message.includes("ram") ||
    message.includes("resource")
  ) {
    return "INSUFFICIENT_RESOURCES";
  }

  if (
    message.includes("compatible") ||
    message.includes("compatibility")
  ) {
    return "MODEL_INCOMPATIBLE";
  }

  if (message.includes("not found")) {
    return "MODEL_NOT_FOUND";
  }

  return "VEYRA_LOCAL_TEST_FAILED";
}

/**
 * ============================================================================
 * Stage runner
 * ============================================================================
 */

async function runStage<T>(
  number: number,
  name: string,
  callback: () => Promise<T>,
): Promise<T> {
  section(`[${number}/9] ${name}`);

  const startedAt = Date.now();

  stages.push({
    number,
    name,
    state: "running",
    startedAt,
  });

  try {
    const result = await callback();

    stages[stages.length - 1] = {
      number,
      name,
      state: "passed",
      startedAt,
      completedAt: Date.now(),
    };

    return result;
  } catch (error) {
    stages[stages.length - 1] = {
      number,
      name,
      state: "failed",
      startedAt,
      completedAt: Date.now(),
      errorCode: errorCode(error),
      reason: errorMessage(error),
    };

    throw error;
  }
}

/**
 * ============================================================================
 * Model helpers
 * ============================================================================
 */

function getModelArtifacts(model: ModelDefinition) {
  return model.package?.artifacts ?? [];
}

function getModelPackageSize(
  model: ModelDefinition,
): number {
  return getModelArtifacts(model).reduce(
    (total, artifact) =>
      total + artifact.sizeBytes,
    0,
  );
}

function describeModel(
  model: ModelDefinition,
): void {
  const artifacts = getModelArtifacts(model);

  success(`Model: ${model.displayName}`);

  success(`Model ID: ${model.id}`);

  success(`Runtime: ${model.runtime}`);

  success(`Modality: ${model.modality}`);

  success(`Quantization: ${model.quantization}`);

  success(`Artifacts: ${artifacts.length}`);

  success(
    `Package size: ${formatBytes(
      getModelPackageSize(model),
    )}`,
  );
}

/**
 * ============================================================================
 * Stage 1 — Hardware detection
 * ============================================================================
 */

async function detectHardware(): Promise<HardwareProfile> {
  return runStage(
    1,
    "Hardware detection",
    async () => {
      progress(
        "Creating Veyra HardwareProfiler...",
      );

      const profiler = new HardwareProfiler();

      progress(
        "Running Veyra hardware detection...",
      );

      const profile = await profiler.profile();

      pipeline.hardwareProfile = profile;

      success(
        `Operating system: ${profile.operatingSystem}`,
      );

      success(
        `Architecture: ${profile.architecture}`,
      );

      success(`CPU: ${profile.cpu.brand}`);

      success(
        `Physical cores: ${profile.cpu.physicalCores}`,
      );

      success(
        `Logical cores: ${profile.cpu.logicalCores}`,
      );

      success(
        `RAM: ${profile.memory.totalGB.toFixed(
          2,
        )} GB total`,
      );

      success(
        `Available RAM: ${profile.memory.availableGB.toFixed(
          2,
        )} GB`,
      );

      success(`Hardware tier: ${profile.tier}`);

      success(
        `Local AI recommended: ${
          profile.localAIRecommended
            ? "yes"
            : "no"
        }`,
      );

      success(
        `llama.cpp detected by profiler: ${
          profile.runtime.llamaCpp
            ? "yes"
            : "no"
        }`,
      );

      return profile;
    },
  );
}

/**
 * ============================================================================
 * Stage 2 — Model selection + core manager construction
 * ============================================================================
 */

async function createModelPipeline(
  profile: HardwareProfile,
): Promise<{
  readonly modelManager: ModelManager;
  readonly selectedModel: ModelDefinition;
}> {
  return runStage(
    2,
    "Hardware/model selection",
    async () => {
      progress("Creating ModelPaths...");

      const paths = new ModelPaths({
        applicationDataDirectory:
          MODEL_ROOT,
      });

      pipeline.paths = paths;

      success(
        `Model root: ${paths.getRootDirectory()}`,
      );

      progress("Creating ModelStorage...");

      const storage = new ModelStorage({
        paths,
      });

      await storage.initialize();

      success("ModelStorage initialized.");

      progress(
        "Creating ModelDownloadQueue...",
      );

      const queue = new ModelDownloadQueue({
        stateFilePath:
          paths.getDownloadQueueStatePath(),

        concurrency: 1,

        modelResolver: (modelId) =>
          defaultModelRegistry.get(modelId),
      });

      await queue.initialize();

      success(
        "ModelDownloadQueue initialized.",
      );

      progress(
        "Creating ModelInstallationManager...",
      );

      const installationManager =
        new ModelInstallationManager({
          queue,
          storage,
        });

      success(
        "ModelInstallationManager connected to ModelStorage and queue.",
      );

      /*
       * Runtime infrastructure
       * -----------------------
       *
       * This is the important connection that was missing
       * from the previous test.
       */

      progress(
        "Creating RuntimeInstaller...",
      );

      const runtimeInstaller =
        new RuntimeInstaller({
          paths,
        });

      pipeline.runtimeInstaller =
        runtimeInstaller;

      success(
        "RuntimeInstaller connected to ModelPaths.",
      );

      progress(
        "Creating LlamaRuntimeLocator...",
      );

      const runtimeLocator =
        new LlamaRuntimeLocator({
          paths,

          allowLegacyPaths: true,
        });

      pipeline.runtimeLocator =
        runtimeLocator;

      success(
        "LlamaRuntimeLocator connected to ModelPaths.",
      );

      progress("Creating RuntimeRegistry...");

      const runtimeRegistry =
        new RuntimeRegistry();

      progress(
        "Creating ModelRuntimeManager...",
      );

      const runtimeManager =
        new ModelRuntimeManager({
          storage,
          runtimeRegistry,
        });

      success(
        "ModelRuntimeManager connected to ModelStorage and RuntimeRegistry.",
      );

      progress("Creating ModelManager...");

      const manager = new ModelManager(
        {
          selection: {
            fallbackCount: 3,

            allowWarnings: true,
          },

          installationManager,

          runtimeManager,
        },
        defaultModelRegistry,
        undefined,
        installationManager,
        runtimeManager,
      );

      success(
        "ModelManager connected to installation and runtime managers.",
      );

      pipeline.modelManager = manager;

      pipeline.storage = storage;

      pipeline.queue = queue;

      pipeline.installationManager =
        installationManager;

      pipeline.runtimeManager =
        runtimeManager;

      pipeline.runtimeRegistry =
        runtimeRegistry;

      progress(
        "Running ModelManager.createSelectionPlan()...",
      );

      const plan =
        manager.createSelectionPlan(
          profile,
        );

      success(
        `Hardware tier selected: ${plan.hardwareTier}`,
      );

      success(
        `Compatible models evaluated: ${plan.allCompatibleModels.length}`,
      );

      section(
        "LLM compatibility diagnostics",
      );

      const llmGroup =
        plan.groups.find(
          (group) =>
            group.modality === "llm",
        );

      if (!llmGroup) {
        throw new Error(
          "Veyra did not produce an LLM selection group.",
        );
      }

      const llmCandidates =
        defaultModelRegistry
          .listByModality("llm")
          .filter(
            (model) =>
              model.availability ===
              "available",
          );

      for (const model of llmCandidates) {
        const compatibility =
          manager.evaluateModel(
            model.id,
            profile,
          );

        info(
          `${model.displayName}: ${compatibility.level} ` +
            `(score ${compatibility.score}/100)`,
        );

        for (const reason of compatibility.reasons) {
          info(`  reason: ${reason}`);
        }

        for (const warning of compatibility.warnings) {
          info(`  warning: ${warning}`);
        }

        for (const reason of compatibility.blockingReasons) {
          info(`  blocked: ${reason}`);
        }
      }

      if (llmGroup.primary) {
        success(
          `Selected LLM: ${llmGroup.primary.model.displayName} ` +
            `(${llmGroup.primary.compatibility.level})`,
        );
      }

      if (!llmGroup.primary) {
        const availableModels =
          defaultModelRegistry
            .listByModality("llm")
            .filter(
              (model) =>
                model.availability ===
                "available",
            )
            .map(
              (model) => model.id,
            );

        throw new Error(
          [
            "Veyra ModelSelector did not produce",
            "a compatible LLM model.",
            "",
            `Hardware tier: ${profile.tier}`,
            `Available LLM models: ${
              availableModels.join(
                ", ",
              ) || "none"
            }`,
          ].join("\n"),
        );
      }

      manager.activateSelectionPlan(
        plan,
      );

      let selectedModel =
        llmGroup.primary.model;

      if (TEST_MODEL_ID) {
        progress(
          `Validating requested model override "${TEST_MODEL_ID}"...`,
        );

        const override =
          defaultModelRegistry.get(
            TEST_MODEL_ID,
          );

        if (!override) {
          throw new Error(
            `VEYRA_TEST_MODEL_ID "${TEST_MODEL_ID}" is not registered.`,
          );
        }

        if (
          override.availability !==
          "available"
        ) {
          throw new Error(
            `VEYRA_TEST_MODEL_ID "${TEST_MODEL_ID}" is not available for installation.`,
          );
        }

        if (override.modality !== "llm") {
          throw new Error(
            `VEYRA_TEST_MODEL_ID "${TEST_MODEL_ID}" is not an LLM.`,
          );
        }

        const compatibility =
          manager.evaluateModel(
            override.id,
            profile,
          );

        if (
          compatibility.level ===
          "incompatible"
        ) {
          throw new Error(
            [
              `Requested model "${TEST_MODEL_ID}" is incompatible.`,
              "",
              `Compatibility level: ${compatibility.level}`,
              `Score: ${compatibility.score}`,
              "",
              "Blocking reasons:",
              ...(compatibility.blockingReasons.length >
              0
                ? compatibility.blockingReasons.map(
                    (reason) =>
                      `  - ${reason}`,
                  )
                : [
                    "  - No blocking reason supplied.",
                  ]),
            ].join("\n"),
          );
        }

        selectedModel = override;

        success(
          `Explicit model override accepted: ${selectedModel.id}`,
        );
      }

      if (
        selectedModel.runtime !==
        "llama_cpp"
      ) {
        throw new Error(
          [
            `Selected model "${selectedModel.id}" uses runtime "${selectedModel.runtime}".`,
            "",
            "This integration test specifically validates",
            "the Veyra llama_cpp local LLM pipeline.",
          ].join("\n"),
        );
      }

      pipeline.selectedModel =
        selectedModel;

      describeModel(selectedModel);

      return {
        modelManager: manager,
        selectedModel,
      };
    },
  );
}

/**
 * ============================================================================
 * Stage 3 — Compatibility
 * ============================================================================
 */

async function verifyCompatibility(
  profile: HardwareProfile,
  modelManager: ModelManager,
  selectedModel: ModelDefinition,
): Promise<void> {
  await runStage(
    3,
    "Compatibility",
    async () => {
      progress(
        `Evaluating "${selectedModel.id}" through ModelManager...`,
      );

      const compatibility =
        modelManager.evaluateModel(
          selectedModel.id,
          profile,
        );

      info(
        `Level: ${compatibility.level}`,
      );

      info(
        `Score: ${compatibility.score.toFixed(
          1,
        )}/100`,
      );

      if (
        compatibility.reasons.length > 0
      ) {
        info("Reasons:");

        for (const reason of compatibility.reasons) {
          info(`  - ${reason}`);
        }
      }

      if (
        compatibility.warnings.length > 0
      ) {
        info("Warnings:");

        for (const warning of compatibility.warnings) {
          info(`  - ${warning}`);
        }
      }

      if (
        compatibility.blockingReasons
          .length > 0
      ) {
        info("Blocking reasons:");

        for (const reason of compatibility.blockingReasons) {
          info(`  - ${reason}`);
        }
      }

      if (
        compatibility.level ===
        "incompatible"
      ) {
        throw new Error(
          [
            `Model "${selectedModel.id}" is incompatible with this hardware.`,
            "",
            ...compatibility.blockingReasons,
          ].join("\n"),
        );
      }

      success(
        `Model compatibility: ${compatibility.level}`,
      );

      if (
        compatibility.level ===
        "compatible_with_warning"
      ) {
        success(
          "Compatibility passed with warnings.",
        );
      } else {
        success(
          "Model is fully compatible.",
        );
      }

      const runtimeRegistry =
        pipeline.runtimeRegistry;

      if (!runtimeRegistry) {
        throw new Error(
          "RuntimeRegistry was not created.",
        );
      }

      success(
        "RuntimeRegistry exists.",
      );
    },
  );
}

/**
 * ============================================================================
 * Stage 4 — Installation check
 * ============================================================================
 */

async function checkInstallation(
  selectedModel: ModelDefinition,
): Promise<boolean> {
  let alreadyInstalled = false;

  await runStage(
    4,
    "Installation check",
    async () => {
      const installationManager =
        pipeline.installationManager;

      if (!installationManager) {
        throw new Error(
          "ModelInstallationManager is not connected to ModelManager.",
        );
      }

      progress(
        "Checking ModelStorage for an existing verified installation...",
      );

      const stored =
        await installationManager.getInstalledModel(
          selectedModel,
        );

      if (stored) {
        alreadyInstalled = true;

        success(
          "Verified installation already exists.",
        );

        success(
          `Manifest path: ${stored.manifestPath}`,
        );

        success(
          `Primary artifact: ${stored.artifactPath}`,
        );

        success(
          `Installed artifacts: ${
            Object.keys(
              stored.artifactPaths,
            ).length
          }`,
        );

        return;
      }

      info(
        "No verified installation exists yet.",
      );

      success(
        "Model installation is required.",
      );
    },
  );

  return alreadyInstalled;
}

/**
 * ============================================================================
 * Stage 5 — Installation
 * ============================================================================
 */

async function installModel(
  modelManager: ModelManager,
  selectedModel: ModelDefinition,
  alreadyInstalled: boolean,
): Promise<void> {
  await runStage(
    5,
    "Model installation",
    async () => {
      if (alreadyInstalled) {
        success(
          "Existing verified installation will be reused.",
        );

        const installationManager =
          pipeline.installationManager;

        const paths = pipeline.paths;

        if (
          installationManager &&
          paths
        ) {
          const modelDirectory =
            paths.getModelDirectory(
              selectedModel.modality,
              selectedModel.id,
            );

          try {
            const prepared =
              await installationManager.prepareModel(
                selectedModel,
                modelDirectory,
              );

            if (prepared.memorySafe) {
              success(
                "Installed model is currently memory-safe to load.",
              );
            } else {
              info(
                "Installed model is valid, but current memory pressure prevents immediate loading.",
              );

              for (const warning of prepared.warnings) {
                info(`  ${warning}`);
              }
            }
          } catch (error) {
            info(
              `Could not perform post-install memory diagnostics: ${errorMessage(
                error,
              )}`,
            );
          }
        }

        return;
      }

      progress(
        `Installing "${selectedModel.displayName}" through ModelManager...`,
      );

      progress(
        "ModelManager → ModelInstallationManager",
      );

      progress(
        "ModelInstallationManager → ModelPackageDownloader",
      );

      progress(
        "ModelPackageDownloader → ModelDownloader",
      );

      let lastPercentage = -1;

      const installation =
        await modelManager.install(
          selectedModel.id,
          {
            priority:
              selectedModel.priority,

            onProgress:
              (
                downloadProgress,
              ) => {
                const current =
                  downloadProgress.percentage;

                const numericPercentage =
                  typeof current ===
                    "number" &&
                  Number.isFinite(
                    current,
                  )
                    ? current
                    : null;

                const rounded =
                  numericPercentage ===
                  null
                    ? -1
                    : Math.floor(
                        numericPercentage,
                      );

                if (
                  rounded ===
                  lastPercentage
                ) {
                  return;
                }

                lastPercentage =
                  rounded;

                const downloaded =
                  formatBytes(
                    downloadProgress.bytesDownloaded,
                  );

                const total =
                  formatBytes(
                    downloadProgress.totalBytes,
                  );

                const phase = String(
                  downloadProgress.phase ??
                    "download",
                );

                process.stdout.write(
                  `\r      ↓ ${phase.padEnd(
                    12,
                  )} ${formatPercentage(
                    numericPercentage,
                  ).padStart(
                    7,
                  )} ${downloaded} / ${total}   `,
                );

                if (
                  rounded >= 100
                ) {
                  process.stdout.write(
                    "\n",
                  );
                }
              },
          },
        );

      process.stdout.write("\n");

      success(
        "ModelManager installation completed.",
      );

      success(
        `Downloaded bytes: ${formatBytes(
          installation.download
            .bytesDownloaded,
        )}`,
      );

      success(
        `SHA-256: ${installation.download.sha256}`,
      );

      success(
        `Primary artifact: ${installation.download.filePath}`,
      );

      const installationManager =
        pipeline.installationManager;

      if (!installationManager) {
        throw new Error(
          "ModelInstallationManager is not available after installation.",
        );
      }

      const paths = pipeline.paths;

      if (!paths) {
        throw new Error(
          "ModelPaths is not available after installation.",
        );
      }

      const modelDirectory =
        paths.getModelDirectory(
          selectedModel.modality,
          selectedModel.id,
        );

      const prepared =
        await installationManager.prepareModel(
          selectedModel,
          modelDirectory,
        );

      if (prepared.memorySafe) {
        success(
          "Model is currently memory-safe to load.",
        );
      } else {
        info(
          "Model installation completed successfully, but the model should not be loaded yet because of current memory pressure.",
        );

        for (const warning of prepared.warnings) {
          info(`  ${warning}`);
        }
      }

      const manifestPath =
        paths.getManifestPath(
          selectedModel.modality,
          selectedModel.id,
        );

      success(
        `Manifest: ${manifestPath}`,
      );

      try {
        await fs.access(manifestPath);

        success(
          "Manifest file exists on disk.",
        );
      } catch {
        throw new Error(
          [
            "Model installation completed,",
            "but the expected manifest file",
            "could not be found.",
            "",
            `Expected manifest: ${manifestPath}`,
          ].join("\n"),
        );
      }

      success(
        "Model package registered in ModelStorage.",
      );
    },
  );
}

/**
 * ============================================================================
 * Stage 6 — Integrity / manifest verification
 * ============================================================================
 */

async function verifyInstallation(
  selectedModel: ModelDefinition,
): Promise<void> {
  await runStage(
    6,
    "Integrity verification",
    async () => {
      const installationManager =
        pipeline.installationManager;

      if (!installationManager) {
        throw new Error(
          "ModelInstallationManager is not connected.",
        );
      }

      progress(
        "Reading the installed model through ModelStorage...",
      );

      const stored =
        await installationManager.getInstalledModel(
          selectedModel,
        );

      if (!stored) {
        throw new Error(
          [
            `ModelStorage did not return a verified installation for "${selectedModel.id}".`,
            "",
            "The model may have downloaded but was not",
            "successfully registered as a valid installation.",
          ].join("\n"),
        );
      }

      success("Stored model found.");

      success(
        `Manifest path: ${stored.manifestPath}`,
      );

      success(
        `Primary artifact: ${stored.artifactPath}`,
      );

      success(
        `Manifest version: ${stored.manifest.manifestVersion}`,
      );

      success(
        `Artifact count: ${
          Object.keys(
            stored.artifactPaths,
          ).length
        }`,
      );

      success(
        "ModelStorage accepted the installation.",
      );

      success(
        "Manifest identity verified.",
      );

      success(
        "Artifact paths verified.",
      );

      success(
        "Required artifacts verified.",
      );

      success(
        "Installation integrity verified.",
      );
    },
  );
}

/**
 * ============================================================================
 * Stage 7 — Runtime installation + loading
 * ============================================================================
 */

async function loadRuntime(
  selectedModel: ModelDefinition,
): Promise<void> {
  await runStage(
    7,
    "Runtime installation & loading",
    async () => {
      const runtimeManager =
        pipeline.runtimeManager;

      if (!runtimeManager) {
        throw new Error(
          "ModelRuntimeManager is not connected.",
        );
      }

      const runtimeRegistry =
        pipeline.runtimeRegistry;

      if (!runtimeRegistry) {
        throw new Error(
          "RuntimeRegistry is not connected.",
        );
      }

      const runtimeInstaller =
        pipeline.runtimeInstaller;

      if (!runtimeInstaller) {
        throw new Error(
          "RuntimeInstaller is not connected.",
        );
      }

      const runtimeLocator =
        pipeline.runtimeLocator;

      if (!runtimeLocator) {
        throw new Error(
          "LlamaRuntimeLocator is not connected.",
        );
      }

      /*
       * ----------------------------------------------------------------------
       * Runtime installation
       * ----------------------------------------------------------------------
       */

      progress(
        "Ensuring the llama.cpp runtime is installed...",
      );

      const runtimeInstallation =
        await runtimeInstaller.ensureLlamaCpp(
          {
            onDownloadProgress: (
              downloadedBytes,
              totalBytes,
            ) => {
              const percentage =
                totalBytes &&
                totalBytes > 0
                  ? (downloadedBytes /
                      totalBytes) *
                    100
                  : undefined;

              process.stdout.write(
                `\r      ↓ runtime       ${formatPercentage(
                  percentage,
                ).padStart(
                  7,
                )} ${formatBytes(
                  downloadedBytes,
                )} / ${formatBytes(
                  totalBytes,
                )}   `,
              );

              if (
                percentage !==
                  undefined &&
                percentage >= 100
              ) {
                process.stdout.write(
                  "\n",
                );
              }
            },
          },
        );

      process.stdout.write("\n");

      if (runtimeInstallation.downloaded) {
        success(
          `llama.cpp runtime downloaded: ${runtimeInstallation.version}`,
        );

        success(
          `Runtime package: ${runtimeInstallation.packageName}`,
        );

        success(
          `Runtime SHA-256: ${runtimeInstallation.packageSha256}`,
        );
      } else {
        success(
          `Existing llama.cpp runtime reused: ${runtimeInstallation.version}`,
        );
      }

      success(
        `Runtime directory: ${runtimeInstallation.runtimeDirectory}`,
      );

      success(
        `Runtime manifest: ${runtimeInstallation.manifestPath}`,
      );

      /*
       * ----------------------------------------------------------------------
       * Runtime locator
       * ----------------------------------------------------------------------
       *
       * Do not blindly trust the installer path.
       *
       * The locator is the application's runtime discovery
       * abstraction.
       */

      progress(
        "Resolving the installed runtime through LlamaRuntimeLocator...",
      );

      const location =
        await runtimeLocator.resolve();

      if (!location) {
        throw new Error(
          [
            "RuntimeInstaller completed successfully,",
            "but LlamaRuntimeLocator could not resolve",
            "the installed llama.cpp executable.",
            "",
            `Expected runtime directory: ${runtimeInstallation.runtimeDirectory}`,
            `Expected executable: ${runtimeInstallation.executablePath}`,
          ].join("\n"),
        );
      }

      pipeline.runtimeExecutable =
        location.executablePath;

      success(
        `Runtime source: ${location.source}`,
      );

      success(
        `llama-server: ${location.executablePath}`,
      );

      success(
        `Runtime directory: ${location.runtimeDirectory}`,
      );

      if (location.version) {
        success(
          `Runtime version: ${location.version}`,
        );
      }

      /*
       * ----------------------------------------------------------------------
       * Runtime registration
       * ----------------------------------------------------------------------
       */

      if (
        runtimeRegistry.has("llama_cpp")
      ) {
        progress(
          "llama_cpp is already registered.",
        );

        const existing =
          runtimeRegistry.get(
            "llama_cpp",
          );

        if (
          !(existing instanceof
            LlamaCppRuntime)
        ) {
          throw new Error(
            [
              "RuntimeRegistry already contains a",
              "llama_cpp runtime, but it is not",
              "the expected LlamaCppRuntime instance.",
            ].join(" "),
          );
        }

        pipeline.runtime =
          existing;
      } else {
        progress(
          "Registering llama_cpp runtime factory...",
        );

        runtimeRegistry.register(
          "llama_cpp",
          () =>
            new LlamaCppRuntime({
              executablePath:
                location.executablePath,

              host: RUNTIME_HOST,

              port: RUNTIME_PORT,

              startupTimeoutMs:
                STARTUP_TIMEOUT_MS,

              healthPollIntervalMs:
                250,

              shutdownTimeoutMs:
                5_000,

              mmprojGpuOffload: true,
            }),
        );

        success(
          "llama_cpp runtime factory registered.",
        );

        const runtime =
          runtimeRegistry.get(
            "llama_cpp",
          );

        if (
          !(runtime instanceof
            LlamaCppRuntime)
        ) {
          throw new Error(
            "RuntimeRegistry did not return LlamaCppRuntime.",
          );
        }

        pipeline.runtime =
          runtime;
      }

      const runtime =
        pipeline.runtime;

      if (!runtime) {
        throw new Error(
          "LlamaCppRuntime instance was not created.",
        );
      }

      success(
        `Runtime instance created: ${runtime.name}`,
      );

      /*
       * ----------------------------------------------------------------------
       * Model/runtime compatibility
       * ----------------------------------------------------------------------
       */

      success(
        `Registered runtimes: ${
          runtimeManager
            .listRuntimes()
            .join(", ") ||
          "none"
        }`,
      );

      if (
        !runtimeManager.supportsModel(
          selectedModel,
        )
      ) {
        throw new Error(
          [
            `RuntimeRegistry does not support model "${selectedModel.id}".`,
            `Model runtime requirement: ${selectedModel.runtime}`,
          ].join("\n"),
        );
      }

      success(
        `Runtime supports "${selectedModel.id}".`,
      );

      /*
       * ----------------------------------------------------------------------
       * Runtime preparation
       * ----------------------------------------------------------------------
       */

      progress(
        "Preparing model load through ModelRuntimeManager...",
      );

      await runtimeManager.prepareLoad(
        selectedModel,
      );

      success(
        "Runtime load preparation passed.",
      );

      /*
       * ----------------------------------------------------------------------
       * REAL llama.cpp loading
       * ----------------------------------------------------------------------
       */

      progress(
        "Loading verified model through ModelRuntimeManager...",
      );

      const gpuLayers =
        process.env.VEYRA_GPU_LAYERS
          ? Number.parseInt(
              process.env.VEYRA_GPU_LAYERS,
              10,
            )
          : undefined;

      const threads =
        process.env.VEYRA_LLAMA_THREADS
          ? Number.parseInt(
              process.env.VEYRA_LLAMA_THREADS,
              10,
            )
          : undefined;

      const batchSize =
        process.env.VEYRA_LLAMA_BATCH_SIZE
          ? Number.parseInt(
              process.env.VEYRA_LLAMA_BATCH_SIZE,
              10,
            )
          : undefined;

      await runtimeManager.load(
        selectedModel,
        {
          contextSize: 4096,

          gpuLayers:
            Number.isFinite(
              gpuLayers,
            )
              ? gpuLayers
              : undefined,

          threads:
            Number.isFinite(
              threads,
            )
              ? threads
              : undefined,

          batchSize:
            Number.isFinite(
              batchSize,
            )
              ? batchSize
              : undefined,
        },
      );

      pipeline.loaded = true;

      success(
        "ModelRuntimeManager.load() completed.",
      );

      success(
        "llama.cpp runtime loaded.",
      );

      const health: ModelRuntimeHealth =
        await runtimeManager.health();

      if (!health.ready) {
        throw new Error(
          [
            "llama.cpp reported an unhealthy runtime after loading.",
            `Runtime: ${health.runtimeName}`,
            `Loaded model: ${
              health.loadedModelId ??
              "none"
            }`,
          ].join("\n"),
        );
      }

      if (
        health.loadedModelId !==
        selectedModel.id
      ) {
        throw new Error(
          [
            "Runtime loaded a different model than expected.",
            "",
            `Expected: ${selectedModel.id}`,
            `Actual: ${
              health.loadedModelId ??
              "none"
            }`,
          ].join("\n"),
        );
      }

      success(
        "Runtime health check passed.",
      );

      success(
        `Loaded model: ${health.loadedModelId}`,
      );

      if (
        runtime.name !== "llama_cpp"
      ) {
        throw new Error(
          `Resolved runtime has unexpected name "${runtime.name}".`,
        );
      }

      success(
        "Runtime identity verified: llama_cpp.",
      );
    },
  );
}

/**
 * ============================================================================
 * Stage 8 — REAL inference
 * ============================================================================
 */

async function runInference(
  modelManager: ModelManager,
  selectedModel: ModelDefinition,
): Promise<void> {
  await runStage(
    8,
    "Real inference",
    async () => {
      pipeline.inferenceAttempted =
        true;

      progress(
        "Sending a real prompt through ModelManager.generate()...",
      );

      info(`Model: ${selectedModel.id}`);

      info(
        `Prompt: "${TEST_PROMPT}"`,
      );

      const startedAt = Date.now();

      const result =
        await modelManager.generate({
          prompt: TEST_PROMPT,

          maxTokens: 32,

          temperature: 0,

          topP: 1,
        });

      const duration =
        Date.now() - startedAt;

      const response =
        result.text.trim();

      const normalized =
        response
          .replace(
            /^["']|["']$/g,
            "",
          )
          .trim();

      console.log("");

      info(
        `Response: "${response}"`,
      );

      info(
        `Duration: ${formatDuration(
          duration,
        )}`,
      );

      if (
        result.promptTokens !==
        undefined
      ) {
        info(
          `Prompt tokens: ${result.promptTokens}`,
        );
      }

      if (
        result.completionTokens !==
        undefined
      ) {
        info(
          `Completion tokens: ${result.completionTokens}`,
        );
      }

      if (
        result.tokensPerSecond !==
          undefined &&
        Number.isFinite(
          result.tokensPerSecond,
        )
      ) {
        info(
          `Tokens/sec: ${result.tokensPerSecond.toFixed(
            2,
          )}`,
        );
      }

      if (
        normalized !==
        EXPECTED_RESPONSE
      ) {
        throw new Error(
          [
            "Real inference completed, but the response",
            "did not match the integration-test response.",
            "",
            `Expected: ${EXPECTED_RESPONSE}`,
            `Received: ${
              normalized || "(empty)"
            }`,
          ].join("\n"),
        );
      }

      pipeline.inferencePassed =
        true;

      success(
        "Real inference completed.",
      );

      success(
        "Response matched VEYRA_LOCAL_TEST_OK.",
      );
    },
  );
}

/**
 * ============================================================================
 * Stage 9 — Final health
 * ============================================================================
 */

async function finalHealthCheck(
  selectedModel: ModelDefinition,
): Promise<void> {
  await runStage(
    9,
    "Final health check",
    async () => {
      const runtimeManager =
        pipeline.runtimeManager;

      if (!runtimeManager) {
        throw new Error(
          "ModelRuntimeManager is not connected.",
        );
      }

      progress(
        "Checking final runtime health...",
      );

      const health =
        await runtimeManager.health();

      if (!health.ready) {
        throw new Error(
          "Final runtime health check reported not ready.",
        );
      }

      if (
        health.loadedModelId !==
        selectedModel.id
      ) {
        throw new Error(
          [
            "Final health check found the wrong loaded model.",
            "",
            `Expected: ${selectedModel.id}`,
            `Actual: ${
              health.loadedModelId ??
              "none"
            }`,
          ].join("\n"),
        );
      }

      success("Runtime healthy.");

      success(
        `Loaded model confirmed: ${health.loadedModelId}`,
      );

      success(
        "Inference state: PASSED",
      );
    },
  );
}

/**
 * ============================================================================
 * Cleanup
 * ============================================================================
 */

async function cleanup(): Promise<void> {
  section("Cleanup");

  if (pipeline.runtimeManager) {
    try {
      progress(
        "Unloading llama.cpp runtime...",
      );

      await pipeline.runtimeManager.unload();

      pipeline.loaded = false;

      success(
        "Runtime unloaded cleanly.",
      );
    } catch (error) {
      console.error(
        `      ! Runtime unload failed: ${errorMessage(
          error,
        )}`,
      );
    }
  }

  if (pipeline.queue) {
    try {
      await pipeline.queue.flushPersistence();

      success(
        "Download queue persistence flushed.",
      );
    } catch (error) {
      console.error(
        `      ! Queue persistence flush failed: ${errorMessage(
          error,
        )}`,
      );
    }

    try {
      await pipeline.queue.dispose();

      success(
        "Download queue disposed.",
      );
    } catch (error) {
      console.error(
        `      ! Queue dispose failed: ${errorMessage(
          error,
        )}`,
      );
    }
  }
}

/**
 * ============================================================================
 * Failure report
 * ============================================================================
 */

function printFailureReport(
  error: unknown,
): void {
  const message = errorMessage(error);

  const code = errorCode(error);

  console.error("");

  title("TEST FAILED");

  console.error(`ERROR CODE: ${code}`);

  console.error("");

  console.error(
    `Model: ${
      pipeline.selectedModel
        ?.displayName ??
      "not selected"
    }`,
  );

  console.error(
    `Model ID: ${
      (
        pipeline.selectedModel?.id ??
        TEST_MODEL_ID
      ) || "not selected"
    }`,
  );

  console.error(
    `Runtime: ${
      pipeline.selectedModel
        ?.runtime ??
      "not selected"
    }`,
  );

  console.error("");

  console.error("Reason:");

  console.error(message);

  console.error("");

  console.error("Pipeline status:");

  for (const stage of stages) {
    const symbol =
      stage.state === "passed"
        ? "✓"
        : stage.state === "failed"
          ? "✗"
          : "…";

    console.error(
      `      ${symbol} [${stage.number}/9] ${stage.name}`,
    );

    if (
      stage.state === "failed"
    ) {
      console.error(
        `          Code: ${
          stage.errorCode ?? code
        }`,
      );

      console.error(
        `          Reason: ${
          stage.reason ?? message
        }`,
      );
    }
  }

  console.error("");

  console.error(
    `Runtime loaded: ${
      pipeline.loaded
        ? "YES"
        : "NO"
    }`,
  );

  console.error(
    `Inference attempted: ${
      pipeline.inferenceAttempted
        ? "YES"
        : "NO"
    }`,
  );

  console.error(
    `Inference passed: ${
      pipeline.inferencePassed
        ? "YES"
        : "NO"
    }`,
  );

  console.error("");

  const elapsed =
    Date.now() - testStartedAt;

  console.error(
    `Elapsed before failure: ${formatDuration(
      elapsed,
    )}`,
  );

  console.error("");

  if (
    code ===
    "RUNTIME_INITIALIZATION_FAILED"
  ) {
    console.error(
      "Runtime requirement:",
    );

    console.error(
      "Veyra attempted automatic llama.cpp runtime installation.",
    );

    console.error(
      "Check the runtime installation directory under:",
    );

    console.error(
      `${MODEL_ROOT}\\runtimes\\llama_cpp`,
    );

    console.error("");

    console.error(
      "Manual VEYRA_LLAMA_SERVER_PATH configuration is only an override.",
    );

    console.error("");
  }

  console.error(
    "Pipeline stopped safely.",
  );

  console.error("");
}

/**
 * ============================================================================
 * Main
 * ============================================================================
 */

async function main(): Promise<void> {
  const overallStartedAt =
    Date.now();

  title("VEYRA LOCAL AI TEST");

  console.log("Environment");

  console.log(line());

  info(
    `Platform       ${process.platform}`,
  );

  info(
    `Architecture   ${process.arch}`,
  );

  info(
    `Node           ${process.version}`,
  );

  info(
    `Working dir    ${process.cwd()}`,
  );

  info(
    `Model data     ${MODEL_ROOT}`,
  );

  info(
    `Test model     ${
      TEST_MODEL_ID ||
      "Veyra selector"
    }`,
  );

  info(
    `Runtime host   ${RUNTIME_HOST}`,
  );

  info(
    `Runtime port   ${RUNTIME_PORT}`,
  );

  info(
    `Startup limit  ${formatDuration(
      STARTUP_TIMEOUT_MS,
    )}`,
  );

  const profile =
    await detectHardware();

  const {
    modelManager,
    selectedModel,
  } =
    await createModelPipeline(
      profile,
    );

  await verifyCompatibility(
    profile,
    modelManager,
    selectedModel,
  );

  const alreadyInstalled =
    await checkInstallation(
      selectedModel,
    );

  await installModel(
    modelManager,
    selectedModel,
    alreadyInstalled,
  );

  await verifyInstallation(
    selectedModel,
  );

  await loadRuntime(
    selectedModel,
  );

  await runInference(
    modelManager,
    selectedModel,
  );

  await finalHealthCheck(
    selectedModel,
  );

  await cleanup();

  const duration =
    Date.now() -
    overallStartedAt;

  title("TEST PASSED");

  console.log(
    `Model:          ${selectedModel.displayName}`,
  );

  console.log(
    `Model ID:       ${selectedModel.id}`,
  );

  console.log(
    "Runtime:        llama.cpp",
  );

  console.log(
    "Installation:   VERIFIED",
  );

  console.log(
    "Manifest:       VERIFIED",
  );

  console.log(
    "Integrity:      SHA-256 VERIFIED",
  );

  console.log(
    "Runtime load:   PASSED",
  );

  console.log(
    "Inference:      PASSED",
  );

  console.log(
    `Duration:       ${formatDuration(
      duration,
    )}`,
  );

  console.log(
    "Status:         READY",
  );

  console.log("");
}

/**
 * ============================================================================
 * Process entry point
 * ============================================================================
 */

main().catch(
  async (error: unknown) => {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error(
        `Cleanup error: ${errorMessage(
          cleanupError,
        )}`,
      );
    }

    printFailureReport(error);

    process.exitCode = 1;
  },
);

// desktop/main/ModelSystem.ts

import {
  ModelRegistry,
  defaultModelRegistry,
} from "../../core/models/ModelRegistry";

import {
  ModelManager,
  type ModelManagerOptions,
} from "../../core/models/ModelManager";

import { ModelPaths } from "../../core/models/storage/ModelPaths";

import { ModelStorage } from "../../core/models/storage/ModelStorage";

import { ModelDownloadQueue } from "../../core/models/installation/ModelDownloadQueue";

import { ModelInstallationManager } from "../../core/models/installation/ModelInstallationManager";

import { ModelRuntimeManager } from "../../core/models/runtime/ModelRuntimeManager";

import {
  RuntimeRegistry,
  type ModelRuntimeFactory,
} from "../../core/models/runtime/RuntimeRegistry";

import { LlamaCppRuntime } from "../../core/models/runtime/LlamaCppRuntime";

import { WhisperCppRuntime } from "../../core/models/runtime/WhisperCppRuntime";

import { KokoroRuntime } from "../../core/models/runtime/KokoroRuntime";

import type { ModelSelectionOptions } from "../../core/models/ModelSelector";

export interface ModelSystemRuntimeFactoryMap {
  readonly ollama?: ModelRuntimeFactory;

  readonly llama_cpp?: ModelRuntimeFactory;

  readonly whisper_cpp?: ModelRuntimeFactory;

  readonly kokoro?: ModelRuntimeFactory;

  readonly onnx?: ModelRuntimeFactory;

  readonly native?: ModelRuntimeFactory;

  readonly cloud?: ModelRuntimeFactory;
}

export interface ModelSystemRuntimeBinaryOptions {
  /**
   * Absolute llama-server path.
   *
   * Example:
   *
   * C:\Veyra\tools\llama\llama-server.exe
   */
  readonly llamaCppExecutablePath?: string;

  /**
   * Absolute whisper-cli path.
   */
  readonly whisperCppExecutablePath?: string;

  /**
   * Optional whisper-stream path.
   */
  readonly whisperRealtimeExecutablePath?: string;
}

export interface ModelSystemOptions {
  readonly applicationDataDirectory: string;

  readonly modelSelection?: ModelSelectionOptions;

  readonly registry?: ModelRegistry;

  readonly downloadConcurrency?: number;

  readonly runtimeFactories?: ModelSystemRuntimeFactoryMap;

  readonly runtimeBinaries?: ModelSystemRuntimeBinaryOptions;

  readonly kokoroDType?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
}

export interface ModelSystemStatus {
  readonly initialized: boolean;

  readonly applicationDataDirectory: string;

  readonly registeredModels: number;

  readonly availableModels: number;

  readonly registeredRuntimes: readonly string[];

  readonly installedModels: number;
}

export class ModelSystem {
  private readonly applicationDataDirectory: string;

  private readonly registry: ModelRegistry;

  private readonly paths: ModelPaths;

  private readonly storage: ModelStorage;

  private readonly queue: ModelDownloadQueue;

  private readonly installationManager: ModelInstallationManager;

  private readonly runtimeRegistry: RuntimeRegistry;

  private readonly runtimeManager: ModelRuntimeManager;

  private readonly modelManager: ModelManager;

  private initialized = false;

  private disposed = false;

  public constructor(options: ModelSystemOptions) {
    const applicationDataDirectory = options.applicationDataDirectory.trim();

    if (!applicationDataDirectory) {
      throw new Error(
        "ModelSystem requires a valid application data directory.",
      );
    }

    this.applicationDataDirectory = applicationDataDirectory;

    this.registry = options.registry ?? defaultModelRegistry;

    this.paths = new ModelPaths({
      applicationDataDirectory,
    });

    this.storage = new ModelStorage({
      paths: this.paths,
    });

    this.queue = new ModelDownloadQueue({
      stateFilePath: this.paths.getDownloadQueueStatePath(),

      concurrency: options.downloadConcurrency ?? 1,

      modelResolver: (modelId) => this.registry.get(modelId),
    });

    this.installationManager = new ModelInstallationManager({
      queue: this.queue,

      storage: this.storage,
    });

    this.runtimeRegistry = new RuntimeRegistry();

    /*
     * User-provided implementations win over
     * built-in implementations.
     */
    this.registerRuntimeFactories(options.runtimeFactories);

    this.registerBuiltInRuntimes({
      binaries: options.runtimeBinaries,

      kokoroDType: options.kokoroDType,
    });

    this.runtimeManager = new ModelRuntimeManager({
      storage: this.storage,

      runtimeRegistry: this.runtimeRegistry,
    });

    const modelManagerOptions: ModelManagerOptions = {
      selection: options.modelSelection,

      installationManager: this.installationManager,

      runtimeManager: this.runtimeManager,
    };

    this.modelManager = new ModelManager(modelManagerOptions, this.registry);
  }

  /**
   * ==========================================================================
   * Initialization
   * ==========================================================================
   */

  public async initialize(): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot initialize a disposed ModelSystem.");
    }

    if (this.initialized) {
      return;
    }

    await this.storage.initialize();

    await this.queue.initialize();

    await this.modelManager.restoreAllInstalledModels();

    this.initialized = true;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getApplicationDataDirectory(): string {
    return this.applicationDataDirectory;
  }

  public getPaths(): ModelPaths {
    return this.paths;
  }

  public getStorage(): ModelStorage {
    return this.storage;
  }

  public getDownloadQueue(): ModelDownloadQueue {
    return this.queue;
  }

  public getInstallationManager(): ModelInstallationManager {
    return this.installationManager;
  }

  public getRuntimeRegistry(): RuntimeRegistry {
    return this.runtimeRegistry;
  }

  public getRuntimeManager(): ModelRuntimeManager {
    return this.runtimeManager;
  }

  public getModelManager(): ModelManager {
    return this.modelManager;
  }

  public getRegistry(): ModelRegistry {
    return this.registry;
  }

  public getStatus(): ModelSystemStatus {
    return Object.freeze({
      initialized: this.initialized,

      applicationDataDirectory: this.applicationDataDirectory,

      registeredModels: this.registry.list().length,

      availableModels: this.registry.listAvailable().length,

      registeredRuntimes: Object.freeze(this.runtimeManager.listRuntimes()),

      installedModels: this.modelManager.listInstalled().length,
    });
  }

  /**
   * ==========================================================================
   * Disposal
   * ==========================================================================
   */

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    let firstError: unknown | undefined;

    try {
      await this.runtimeManager.dispose();
    } catch (error) {
      firstError = error;
    }

    try {
      await this.queue.dispose();
    } catch (error) {
      if (firstError === undefined) {
        firstError = error;
      }
    }

    this.initialized = false;

    if (firstError !== undefined) {
      throw firstError;
    }
  }

  /**
   * ==========================================================================
   * User supplied factories
   * ==========================================================================
   */

  private registerRuntimeFactories(
    factories: ModelSystemRuntimeFactoryMap | undefined,
  ): void {
    if (!factories) {
      return;
    }

    this.registerFactory("ollama", factories.ollama);

    this.registerFactory("llama_cpp", factories.llama_cpp);

    this.registerFactory("whisper_cpp", factories.whisper_cpp);

    this.registerFactory("kokoro", factories.kokoro);

    this.registerFactory("onnx", factories.onnx);

    this.registerFactory("native", factories.native);

    this.registerFactory("cloud", factories.cloud);
  }

  /**
   * ==========================================================================
   * Built-in factories
   * ==========================================================================
   */

  private registerBuiltInRuntimes(options: {
    readonly binaries: ModelSystemRuntimeBinaryOptions | undefined;

    readonly kokoroDType: "fp32" | "fp16" | "q8" | "q4" | "q4f16" | undefined;
  }): void {
    /*
     * ------------------------------------------------------------------------
     * Kokoro
     * ------------------------------------------------------------------------
     *
     * Always register this built-in runtime because it does not require a
     * separate executable.
     */
    if (!this.runtimeRegistry.has("kokoro")) {
      this.runtimeRegistry.register(
        "kokoro",
        () =>
          new KokoroRuntime({
            dtype: options.kokoroDType ?? "q8",

            device: "cpu",
          }),
      );
    }

    /*
     * ------------------------------------------------------------------------
     * llama.cpp
     * ------------------------------------------------------------------------
     */

    if (!this.runtimeRegistry.has("llama_cpp")) {
      const executablePath =
        options.binaries?.llamaCppExecutablePath?.trim() ||
        process.env.VEYRA_LLAMA_SERVER?.trim();

      if (executablePath) {
        this.runtimeRegistry.register(
          "llama_cpp",
          () =>
            new LlamaCppRuntime({
              executablePath,
            }),
        );
      }
    }

    /*
     * ------------------------------------------------------------------------
     * whisper.cpp
     * ------------------------------------------------------------------------
     */

    if (!this.runtimeRegistry.has("whisper_cpp")) {
      const executablePath =
        options.binaries?.whisperCppExecutablePath?.trim() ||
        process.env.VEYRA_WHISPER_CPP?.trim();

      if (executablePath) {
        const realtimeExecutablePath =
          options.binaries?.whisperRealtimeExecutablePath?.trim() ||
          process.env.VEYRA_WHISPER_STREAM?.trim();

        this.runtimeRegistry.register(
          "whisper_cpp",
          () =>
            new WhisperCppRuntime({
              executablePath,

              realtimeExecutablePath,
            }),
        );
      }
    }
  }

  private registerFactory(
    kind:
      | "ollama"
      | "llama_cpp"
      | "whisper_cpp"
      | "kokoro"
      | "onnx"
      | "native"
      | "cloud",

    factory: ModelRuntimeFactory | undefined,
  ): void {
    if (!factory) {
      return;
    }

    this.runtimeRegistry.register(kind, factory);
  }
}

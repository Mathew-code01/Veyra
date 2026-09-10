// desktop/main/ModelSystem.ts

/**
 * Veyra Model System
 *
 * Electron MAIN-PROCESS composition root.
 *
 * Connects:
 *
 * ModelRegistry
 *      ↓
 * ModelPaths
 *      ↓
 * ModelStorage
 *      ↓
 * ModelDownloadQueue
 *      ↓
 * ModelInstallationManager
 *      ↓
 * RuntimeRegistry
 *      ↓
 * ModelRuntimeManager
 *      ↓
 * ModelManager
 *
 * This class must never be exposed directly
 * to the renderer.
 */

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

import type { ModelSelectionOptions } from "../../core/models/ModelSelector";

export interface ModelSystemRuntimeFactoryMap {
  readonly ollama?: ModelRuntimeFactory;
  readonly llama_cpp?: ModelRuntimeFactory;
  readonly whisper_cpp?: ModelRuntimeFactory;
  readonly onnx?: ModelRuntimeFactory;
  readonly native?: ModelRuntimeFactory;
  readonly cloud?: ModelRuntimeFactory;
}

export interface ModelSystemOptions {
  /**
   * Canonical persistent application data directory.
   *
   * Electron normally provides:
   *
   *     app.getPath("userData")
   */
  readonly applicationDataDirectory: string;

  /**
   * Optional model-selection configuration.
   */
  readonly modelSelection?: ModelSelectionOptions;

  /**
   * Optional model registry.
   *
   * Production code defaults to the application registry.
   */
  readonly registry?: ModelRegistry;

  /**
   * Maximum simultaneous downloads.
   */
  readonly downloadConcurrency?: number;

  /**
   * Optional lazy runtime factories.
   */
  readonly runtimeFactories?: ModelSystemRuntimeFactoryMap;
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

    /*
     * --------------------------------------------------------------------------
     * Persistent model paths
     * --------------------------------------------------------------------------
     */
    this.paths = new ModelPaths({
      applicationDataDirectory,
    });

    /*
     * --------------------------------------------------------------------------
     * Persistent model storage
     * --------------------------------------------------------------------------
     */
    this.storage = new ModelStorage({
      paths: this.paths,
    });

    /*
     * --------------------------------------------------------------------------
     * Persistent download queue
     * --------------------------------------------------------------------------
     */
    this.queue = new ModelDownloadQueue({
      stateFilePath: this.paths.getDownloadQueueStatePath(),

      concurrency: options.downloadConcurrency ?? 1,

      modelResolver: (modelId) => this.registry.get(modelId),
    });

    /*
     * --------------------------------------------------------------------------
     * Installation manager
     * --------------------------------------------------------------------------
     */
    this.installationManager = new ModelInstallationManager({
      queue: this.queue,

      storage: this.storage,
    });

    /*
     * --------------------------------------------------------------------------
     * Runtime registry
     * --------------------------------------------------------------------------
     */
    this.runtimeRegistry = new RuntimeRegistry();

    this.registerRuntimeFactories(options.runtimeFactories);

    /*
     * --------------------------------------------------------------------------
     * Runtime manager
     * --------------------------------------------------------------------------
     */
    this.runtimeManager = new ModelRuntimeManager({
      storage: this.storage,

      runtimeRegistry: this.runtimeRegistry,
    });

    /*
     * --------------------------------------------------------------------------
     * High-level model manager
     * --------------------------------------------------------------------------
     */
    const modelManagerOptions: ModelManagerOptions = {
      selection: options.modelSelection,

      installationManager: this.installationManager,

      runtimeManager: this.runtimeManager,
    };

    this.modelManager = new ModelManager(modelManagerOptions, this.registry);
  }

  /**
   * Initialize persistent model infrastructure.
   *
   * IMPORTANT:
   *
   * This does not download models.
   */
  public async initialize(): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot initialize a disposed ModelSystem.");
    }

    if (this.initialized) {
      return;
    }

    /*
     * Create the canonical model directories.
     */
    await this.storage.initialize();

    /*
     * Restore persisted download queue state.
     */
    await this.queue.initialize();

    /*
     * Restore only verified installed models.
     *
     * This never downloads anything.
     */
    await this.modelManager.restoreAllInstalledModels();

    this.initialized = true;
  }

  /**
   * Whether the system is initialized.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Persistent application-data directory.
   */
  public getApplicationDataDirectory(): string {
    return this.applicationDataDirectory;
  }

  /**
   * Canonical model-path manager.
   */
  public getPaths(): ModelPaths {
    return this.paths;
  }

  /**
   * Canonical model storage.
   */
  public getStorage(): ModelStorage {
    return this.storage;
  }

  /**
   * Persistent download queue.
   */
  public getDownloadQueue(): ModelDownloadQueue {
    return this.queue;
  }

  /**
   * Installation manager.
   */
  public getInstallationManager(): ModelInstallationManager {
    return this.installationManager;
  }

  /**
   * Runtime registry.
   */
  public getRuntimeRegistry(): RuntimeRegistry {
    return this.runtimeRegistry;
  }

  /**
   * Runtime lifecycle manager.
   */
  public getRuntimeManager(): ModelRuntimeManager {
    return this.runtimeManager;
  }

  /**
   * High-level model manager.
   */
  public getModelManager(): ModelManager {
    return this.modelManager;
  }

  /**
   * Model registry.
   */
  public getRegistry(): ModelRegistry {
    return this.registry;
  }

  /**
   * Safe diagnostic status.
   */
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
   * Gracefully dispose the model system.
   */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    let firstError: unknown = undefined;

    /*
     * Stop runtime processes/sessions first.
     */
    try {
      await this.runtimeManager.dispose();
    } catch (error) {
      firstError = error;
    }

    /*
     * Then stop the persistent download queue.
     */
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
   * Register supplied runtime factories.
   *
   * Factories remain lazy until a model actually
   * requires that runtime.
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

    this.registerFactory("onnx", factories.onnx);

    this.registerFactory("native", factories.native);

    this.registerFactory("cloud", factories.cloud);
  }

  private registerFactory(
    kind: "ollama" | "llama_cpp" | "whisper_cpp" | "onnx" | "native" | "cloud",
    factory: ModelRuntimeFactory | undefined,
  ): void {
    if (!factory) {
      return;
    }

    this.runtimeRegistry.register(kind, factory);
  }
}

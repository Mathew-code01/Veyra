// desktop/services/models/ModelSystem.ts

/**
 * Veyra Model System
 *
 * Electron MAIN-PROCESS composition root for the local
 * model-management infrastructure.
 *
 * This class is responsible for connecting:
 *
 *     ModelRegistry
 *          ↓
 *     ModelPaths
 *          ↓
 *     ModelStorage
 *          ↓
 *     ModelDownloadQueue
 *          ↓
 *     ModelInstallationManager
 *          ↓
 *     RuntimeRegistry
 *          ↓
 *     ModelRuntimeManager
 *          ↓
 *     ModelManager
 *
 * IMPORTANT:
 *
 * This class must never be exposed directly to the renderer.
 *
 * Renderer communication must happen through dedicated,
 * sanitized IPC services.
 */

import {
  ModelRegistry,
  defaultModelRegistry,
} from "../../../core/models/ModelRegistry";

import {
  ModelManager,
  type ModelManagerOptions,
} from "../../../core/models/ModelManager";

import { ModelPaths } from "../../../core/models/storage/ModelPaths";

import { ModelStorage } from "../../../core/models/storage/ModelStorage";

import { ModelDownloadQueue } from "../../../core/models/installation/ModelDownloadQueue";

import { ModelInstallationManager } from "../../../core/models/installation/ModelInstallationManager";

import { ModelRuntimeManager } from "../../../core/models/runtime/ModelRuntimeManager";

import {
  RuntimeRegistry,
  type ModelRuntimeFactory,
} from "../../../core/models/runtime/RuntimeRegistry";

import type { ModelRuntime } from "../../../core/models/runtime/ModelRuntime";

import type { ModelSelectionOptions } from "../../../core/models/ModelSelector";

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
   * Electron normally supplies:
   *
   *     app.getPath("userData")
   */
  readonly applicationDataDirectory: string;

  /**
   * Optional model-selection configuration.
   */
  readonly modelSelection?: ModelSelectionOptions;

  /**
   * Dependency-injected model registry.
   *
   * Defaults to the production registry.
   */
  readonly registry?: ModelRegistry;

  /**
   * Maximum number of simultaneous model downloads.
   *
   * Model downloads are intentionally conservative because
   * they can consume substantial disk/network bandwidth.
   */
  readonly downloadConcurrency?: number;

  /**
   * Optional runtime factories.
   *
   * Runtime implementations are created lazily.
   *
   * We do not force Veyra to start llama.cpp/whisper.cpp/ONNX
   * processes during application startup.
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
     * Persistent paths
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
     * Download queue
     * --------------------------------------------------------------------------
     *
     * The queue resolves model definitions through the same registry
     * owned by this ModelSystem.
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
     *
     * Runtime implementations are registered here, but factories are lazy.
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
     * High-level ModelManager
     * --------------------------------------------------------------------------
     */
    const modelManagerOptions: ModelManagerOptions = {
      selection: options.modelSelection,

      installationManager: this.installationManager,

      runtimeManager: this.runtimeManager,
    };

    this.modelManager = new ModelManager(
      modelManagerOptions,

      this.registry,
    );
  }

  /**
   * Initialize persistent model infrastructure.
   *
   * Safe to call more than once.
   */
  public async initialize(): Promise<void> {
    if (this.disposed) {
      throw new Error("Cannot initialize a disposed ModelSystem.");
    }

    if (this.initialized) {
      return;
    }

    /*
     * 1. Create all model/storage directories.
     */
    await this.storage.initialize();

    /*
     * 2. Restore persisted download queue state.
     *
     * Interrupted downloads are restored by the queue as
     * paused rather than being treated as completed.
     */
    await this.queue.initialize();

    /*
     * 3. Restore verified installed models.
     *
     * This operation never downloads models.
     *
     * Storage integrity remains authoritative.
     */
    await this.modelManager.restoreAllInstalledModels();

    this.initialized = true;
  }

  /**
   * Indicates whether the complete model system
   * has finished initialization.
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Persistent application data root.
   */
  public getApplicationDataDirectory(): string {
    return this.applicationDataDirectory;
  }

  /**
   * Canonical model path manager.
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
   * Installation orchestrator.
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
   * Return a safe main-process status snapshot.
   *
   * This is intentionally plain data and can later be
   * transformed into a renderer-safe IPC DTO.
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
   * Gracefully release runtime and queue resources.
   *
   * Safe to call multiple times.
   */
  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    let firstError: unknown = undefined;

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
   * Register optional runtime factories.
   *
   * Factories are intentionally lazy.
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
    kind: ModelRuntime["name"] extends string
      ? Parameters<RuntimeRegistry["register"]>[0]
      : never,
    factory: ModelRuntimeFactory | undefined,
  ): void {
    if (!factory) {
      return;
    }

    this.runtimeRegistry.register(kind, factory);
  }
}

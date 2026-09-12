// core/models/ModelManager.ts

import type { HardwareProfile } from "../hardware/HardwareProfile";

import {
  defaultModelRegistry,
  type ModelDefinition,
  type ModelModality,
  type ModelRegistry,
} from "./ModelRegistry";

import {
  ModelSelector,
  type ModelSelectionOptions,
  type ModelSelectionPlan,
} from "./ModelSelector";

import {
  ModelCompatibility,
  type ModelCompatibilityResult,
} from "./ModelCompatibility";

import {
  ModelBenchmark,
  type ModelBenchmarkOptions,
  type ModelBenchmarkResult,
} from "./ModelBenchmark";

import type {
  ModelDownloadProgress,
  ModelDownloadResult,
} from "./ModelDownloader";

import {
  ModelInstallationManager,
  type ModelInstallationResult,
} from "./installation/ModelInstallationManager";

import {
  ModelRuntimeManager,
  type RuntimeLoadResult,
} from "./runtime/ModelRuntimeManager";

import type {
  ModelRuntimeGenerateOptions,
  ModelRuntimeGenerationResult,
  ModelRuntimeHealth,
  OnnxRuntimeRunOptions,
  OnnxRuntimeRunResult,
  RealtimeSpeechRecognitionOptions,
  SpeechRecognitionOptions,
  SpeechRecognitionRealtimeSession,
  SpeechRecognitionResult,
  SpeechSynthesisOptions,
  SpeechSynthesisResult,
  VisionGenerationOptions,
} from "./runtime/ModelRuntime";

/**
 * ============================================================================
 * Installed model state
 * ============================================================================
 */

export interface InstalledModel {
  readonly modelId: string;

  readonly filePath: string;

  readonly installedAt: number;

  readonly sizeBytes: number;

  readonly sha256: string;
}

/**
 * ============================================================================
 * Manager configuration
 * ============================================================================
 */

export interface ModelManagerOptions {
  readonly selection?: ModelSelectionOptions;

  readonly installationManager?: ModelInstallationManager;

  readonly runtimeManager?: ModelRuntimeManager;
}

/**
 * ============================================================================
 * Installation
 * ============================================================================
 */

export interface ModelInstallOptions {
  readonly overwrite?: boolean;

  readonly signal?: AbortSignal;

  readonly onProgress?: (progress: ModelDownloadProgress) => void;

  readonly benchmarkAfterInstall?: boolean;

  readonly benchmark?: ModelBenchmarkOptions;

  readonly priority?: number;

  readonly requireMemorySafety?: boolean;
}

export interface ModelInstallResult {
  readonly download: ModelDownloadResult;

  readonly benchmark?: ModelBenchmarkResult;

  readonly installation: ModelInstallationResult;
}

/**
 * ============================================================================
 * Active model plan
 * ============================================================================
 */

export interface ActiveModelPlan {
  readonly generatedAt: number;

  readonly hardwareTier: HardwareProfile["tier"];

  readonly primary: Readonly<Partial<Record<ModelModality, string>>>;

  readonly fallbacks: Readonly<
    Partial<Record<ModelModality, readonly string[]>>
  >;
}

/**
 * ============================================================================
 * Runtime tuning
 * ============================================================================
 */

export interface ModelLoadOptions {
  readonly contextSize?: number;

  readonly gpuLayers?: number;

  readonly threads?: number;

  readonly batchSize?: number;

  readonly signal?: AbortSignal;
}

/**
 * ============================================================================
 * Model manager
 * ============================================================================
 *
 * PUBLIC FACADE
 *
 * Application code should interact with local models through this class.
 *
 * Consumers should NOT import:
 *
 * - ModelStorage
 * - ModelInstallationManager
 * - RuntimeRegistry
 * - ModelRuntimeManager
 * - LlamaCppRuntime
 * - WhisperCppRuntime
 * - OnnxRuntime
 *
 * Architecture:
 *
 *   AI / Audio / Vision
 *            ↓
 *       ModelManager
 *            ↓
 *   ┌────────┴─────────┐
 *   │                  │
 * Installation       Runtime
 *   │                  │
 * Storage       ModelRuntimeManager
 *                       │
 *                 RuntimeRegistry
 *                       │
 *          ┌────────────┼─────────────┐
 *          ↓            ↓             ↓
 *      llama.cpp    whisper.cpp      ONNX
 */
export class ModelManager {
  private readonly selector: ModelSelector;

  private readonly compatibility: ModelCompatibility;

  private readonly benchmark: ModelBenchmark;

  private readonly registry: ModelRegistry;

  private readonly installationManager?: ModelInstallationManager;

  private readonly runtimeManager?: ModelRuntimeManager;

  private currentPlan: ModelSelectionPlan | null = null;

  private activePlan: ActiveModelPlan | null = null;

  private readonly installedModels = new Map<string, InstalledModel>();

  public constructor(
    private readonly options: ModelManagerOptions,

    registry: ModelRegistry = defaultModelRegistry,

    benchmark: ModelBenchmark = new ModelBenchmark(),

    installationManager?: ModelInstallationManager,

    runtimeManager?: ModelRuntimeManager,
  ) {
    this.registry = registry;

    this.selector = new ModelSelector(registry);

    this.compatibility = new ModelCompatibility();

    this.benchmark = benchmark;

    this.installationManager =
      installationManager ?? options.installationManager;

    this.runtimeManager = runtimeManager ?? options.runtimeManager;
  }

  // ==========================================================================
  // Model selection
  // ==========================================================================

  public createSelectionPlan(profile: HardwareProfile): ModelSelectionPlan {
    const plan = this.selector.select(profile, this.options.selection);

    this.currentPlan = plan;

    return plan;
  }

  public getSelectionPlan(): ModelSelectionPlan | null {
    return this.currentPlan;
  }

  public activateSelectionPlan(plan: ModelSelectionPlan): ActiveModelPlan {
    const primary: Partial<Record<ModelModality, string>> = {};

    const fallbacks: Partial<Record<ModelModality, readonly string[]>> = {};

    for (const group of plan.groups) {
      if (group.primary) {
        primary[group.modality] = group.primary.model.id;
      }

      fallbacks[group.modality] = group.fallbacks.map(
        (model) => model.model.id,
      );
    }

    const activePlan = Object.freeze({
      generatedAt: Date.now(),

      hardwareTier: plan.hardwareTier,

      primary: Object.freeze(primary),

      fallbacks: Object.freeze(fallbacks),
    });

    this.activePlan = activePlan;

    return activePlan;
  }

  public getActivePlan(): ActiveModelPlan | null {
    return this.activePlan;
  }

  public getActiveModel(modality: ModelModality): ModelDefinition | null {
    const modelId = this.activePlan?.primary[modality];

    if (!modelId) {
      return null;
    }

    return this.registry.get(modelId) ?? null;
  }

  public getFallbackModels(
    modality: ModelModality,
  ): readonly ModelDefinition[] {
    const ids = this.activePlan?.fallbacks[modality] ?? [];

    return ids
      .map((id) => this.registry.get(id))
      .filter((model): model is ModelDefinition => model !== undefined);
  }

  // ==========================================================================
  // Model lookup
  // ==========================================================================

  public getModel(modelId: string): ModelDefinition {
    return this.registry.require(modelId);
  }

  public evaluateModel(
    modelId: string,
    profile: HardwareProfile,
  ): ModelCompatibilityResult {
    const model = this.registry.require(modelId);

    return this.compatibility.evaluate(model, profile);
  }

  public listAvailableModels(): readonly ModelDefinition[] {
    return Object.freeze([...this.registry.listAvailable()]);
  }

  // ==========================================================================
  // Installation
  // ==========================================================================

  public async install(
    modelId: string,
    options: ModelInstallOptions = {},
  ): Promise<ModelInstallResult> {
    const manager = this.requireInstallationManager();

    const model = this.registry.require(modelId);

    const installation = await manager.installModel(model, {
      priority: options.priority ?? 0,

      requireMemorySafety: options.requireMemorySafety ?? false,

      signal: options.signal,

      overwrite: options.overwrite,

      onProgress: options.onProgress,
    });

    this.cacheInstalledModel(installation);

    let benchmarkResult: ModelBenchmarkResult | undefined;

    if (options.benchmarkAfterInstall) {
      benchmarkResult = await this.benchmarkModel(modelId, options.benchmark);
    }

    return Object.freeze({
      download: installation.download,

      benchmark: benchmarkResult,

      installation,
    });
  }

  /**
   * Ensure a model is installed.
   *
   * Unlike install(), this method first checks the local
   * installation cache and only downloads when necessary.
   */
  public async ensureInstalled(
    modelId: string,
    options: ModelInstallOptions = {},
  ): Promise<InstalledModel> {
    const existing = this.getInstalled(modelId);

    if (existing) {
      return existing;
    }

    const restored = await this.restoreInstalledModel(modelId);

    if (restored) {
      return restored;
    }

    const result = await this.install(modelId, options);

    return this.createInstalledModel(
      result.installation.model.id,
      result.download.filePath,
      result.installation.manifest.installedAt,
      result.download.bytesDownloaded,
      result.download.sha256,
    );
  }

  public async restoreInstalledModel(
    modelId: string,
  ): Promise<InstalledModel | undefined> {
    const model = this.registry.get(modelId);

    if (!model) {
      return undefined;
    }

    const manager = this.requireInstallationManager();

    const stored = await manager.getInstalledModel(model);

    if (!stored) {
      this.installedModels.delete(model.id);

      return undefined;
    }

    const primaryArtifact = stored.manifest.package.artifacts.find(
      (artifact) => artifact.id === stored.manifest.package.primaryArtifactId,
    );

    if (!primaryArtifact) {
      this.installedModels.delete(model.id);

      return undefined;
    }

    const installed = this.createInstalledModel(
      stored.modelId,
      primaryArtifact.filePath,
      stored.manifest.installedAt,
      primaryArtifact.sizeBytes,
      primaryArtifact.sha256,
    );

    this.installedModels.set(model.id, installed);

    return installed;
  }

  public async restoreAllInstalledModels(): Promise<readonly InstalledModel[]> {
    const restored: InstalledModel[] = [];

    const models = this.registry.listAvailable();

    for (const model of models) {
      const installed = await this.restoreInstalledModel(model.id);

      if (installed) {
        restored.push(installed);
      }
    }

    return Object.freeze(restored);
  }

  public async uninstall(modelId: string): Promise<void> {
    const model = this.registry.get(modelId);

    if (!model) {
      return;
    }

    const manager = this.requireInstallationManager();

    /*
     * Never remove files while the runtime
     * is using the model.
     */
    if (this.runtimeManager?.getActiveModel()?.id === modelId) {
      await this.runtimeManager.unload();
    }

    await manager.getStorage().remove(model);

    this.installedModels.delete(modelId);
  }

  public isInstalled(modelId: string): boolean {
    return this.installedModels.has(modelId);
  }

  public getInstalled(modelId: string): InstalledModel | undefined {
    return this.installedModels.get(modelId);
  }

  public listInstalled(): readonly InstalledModel[] {
    return Object.freeze([...this.installedModels.values()]);
  }

  // ==========================================================================
  // Recommended installations
  // ==========================================================================

  public getRecommendedInstallations(
    profile: HardwareProfile,
  ): readonly ModelDefinition[] {
    const plan = this.currentPlan ?? this.createSelectionPlan(profile);

    const recommended: ModelDefinition[] = [];

    for (const group of plan.groups) {
      if (group.primary && !this.isInstalled(group.primary.model.id)) {
        recommended.push(group.primary.model);
      }
    }

    return Object.freeze(recommended);
  }

  // ==========================================================================
  // Benchmarking
  // ==========================================================================

  public async benchmarkModel(
    modelId: string,
    options?: ModelBenchmarkOptions,
  ): Promise<ModelBenchmarkResult> {
    const model = this.registry.require(modelId);

    return this.benchmark.benchmark(model, options);
  }

  public getBenchmark(modelId: string): ModelBenchmarkResult | undefined {
    return this.benchmark.getResult(modelId);
  }

  // ==========================================================================
  // Runtime lifecycle
  // ==========================================================================

  /**
   * Check whether a runtime can execute a model.
   */
  public supportsModel(modelId: string): boolean {
    const model = this.registry.get(modelId);

    if (!model || !this.runtimeManager) {
      return false;
    }

    return this.runtimeManager.supportsModel(model);
  }

  /**
   * Check whether the selected runtime has
   * enough memory/resources to load a model.
   */
  public async prepareLoad(modelId: string): Promise<RuntimeLoadResult> {
    const model = this.registry.require(modelId);

    return this.requireRuntimeManager().prepareLoad(model);
  }

  /**
   * Load a verified local model.
   *
   * Installation is intentionally separate.
   *
   * Use ensureLoaded() when the caller wants
   * install + load behavior.
   */
  public async loadModel(
    modelId: string,
    options: ModelLoadOptions = {},
  ): Promise<void> {
    const runtime = this.requireRuntimeManager();

    const model = this.registry.require(modelId);

    await runtime.load(model, options);
  }

  /**
   * Ensure the model is installed and loaded.
   */
  public async ensureLoaded(
    modelId: string,
    options: ModelLoadOptions & {
      readonly install?: Omit<ModelInstallOptions, "signal">;
    } = {},
  ): Promise<void> {
    await this.ensureInstalled(modelId, {
      ...options.install,
      signal: options.signal,
    });

    await this.loadModel(modelId, options);
  }

  /**
   * Unload the currently active heavyweight runtime.
   */
  public async unloadModel(): Promise<void> {
    await this.requireRuntimeManager().unload();
  }

  /**
   * Return the currently loaded model.
   */
  public getLoadedModel(): ModelDefinition | null {
    return this.runtimeManager?.getActiveModel() ?? null;
  }

  /**
   * Return the active runtime implementation.
   *
   * Kept as a diagnostics API. Application feature
   * code should normally not depend on this object.
   */
  public getActiveRuntime() {
    return this.runtimeManager?.getActiveRuntime() ?? null;
  }

  public getActiveModality(): ModelModality | null {
    return this.runtimeManager?.getActiveModality() ?? null;
  }

  public async getRuntimeHealth(): Promise<ModelRuntimeHealth> {
    return this.requireRuntimeManager().health();
  }

  public listRuntimes(): readonly string[] {
    return this.requireRuntimeManager().listRuntimes();
  }

  // ==========================================================================
  // LLM text generation
  // ==========================================================================

  public async generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    return this.requireRuntimeManager().generate(options);
  }

  // ==========================================================================
  // Vision
  // ==========================================================================

  public async generateVision(
    options: VisionGenerationOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    return this.requireRuntimeManager().generateVision(options);
  }

  // ==========================================================================
  // Speech recognition
  // ==========================================================================

  public async transcribe(
    options: SpeechRecognitionOptions,
  ): Promise<SpeechRecognitionResult> {
    return this.requireRuntimeManager().transcribe(options);
  }

  public async startRealtimeTranscription(
    options: RealtimeSpeechRecognitionOptions,
  ): Promise<SpeechRecognitionRealtimeSession> {
    return this.requireRuntimeManager().startRealtimeTranscription(options);
  }

  // ==========================================================================
  // Text-to-speech
  // ==========================================================================

  public async synthesize(
    options: SpeechSynthesisOptions,
  ): Promise<SpeechSynthesisResult> {
    return this.requireRuntimeManager().synthesize(options);
  }

  // ==========================================================================
  // Generic inference
  // ==========================================================================

  public async runInference(
    options: OnnxRuntimeRunOptions,
  ): Promise<OnnxRuntimeRunResult> {
    return this.requireRuntimeManager().run(options);
  }

  // ==========================================================================
  // Reset
  // ==========================================================================

  public clearPlans(): void {
    this.currentPlan = null;

    this.activePlan = null;
  }

  // ==========================================================================
  // Internal helpers
  // ==========================================================================

  private cacheInstalledModel(installation: ModelInstallationResult): void {
    const installed = this.createInstalledModel(
      installation.model.id,
      installation.download.filePath,
      installation.manifest.installedAt,
      installation.download.bytesDownloaded,
      installation.download.sha256,
    );

    this.installedModels.set(installation.model.id, installed);
  }

  private createInstalledModel(
    modelId: string,
    filePath: string,
    installedAt: number,
    sizeBytes: number,
    sha256: string,
  ): InstalledModel {
    return Object.freeze({
      modelId,

      filePath,

      installedAt,

      sizeBytes,

      sha256,
    });
  }

  private requireInstallationManager(): ModelInstallationManager {
    if (!this.installationManager) {
      throw new Error(
        "ModelInstallationManager is not connected to ModelManager.",
      );
    }

    return this.installationManager;
  }

  private requireRuntimeManager(): ModelRuntimeManager {
    if (!this.runtimeManager) {
      throw new Error("ModelRuntimeManager is not connected to ModelManager.");
    }

    return this.runtimeManager;
  }
}

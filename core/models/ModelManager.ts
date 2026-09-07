// Relative path: core/models/ModelManager.ts

import type { HardwareProfile } from "../hardware/HardwareProfile";

import {
  defaultModelRegistry,
  type ModelDefinition,
  type ModelModality,
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
  ModelDownloader,
  type ModelDownloadOptions,
  type ModelDownloadProgress,
  type ModelDownloadResult,
} from "./ModelDownloader";

import {
  ModelBenchmark,
  type ModelBenchmarkOptions,
  type ModelBenchmarkResult,
} from "./ModelBenchmark";

export interface InstalledModel {
  readonly modelId: string;
  readonly filePath: string;
  readonly installedAt: number;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface ModelManagerOptions {
  readonly modelDirectory: string;
  readonly selection?: ModelSelectionOptions;
}

export interface ModelInstallOptions {
  readonly overwrite?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ModelDownloadProgress) => void;
  readonly benchmarkAfterInstall?: boolean;
  readonly benchmark?: ModelBenchmarkOptions;
}

export interface ModelInstallResult {
  readonly download: ModelDownloadResult;
  readonly benchmark?: ModelBenchmarkResult;
}

export interface ActiveModelPlan {
  readonly generatedAt: number;
  readonly hardwareTier: HardwareProfile["tier"];
  readonly primary: Readonly<Partial<Record<ModelModality, string>>>;
  readonly fallbacks: Readonly<
    Partial<Record<ModelModality, readonly string[]>>
  >;
}

export class ModelManager {
  private readonly selector: ModelSelector;

  private readonly compatibility: ModelCompatibility;

  private readonly downloader: ModelDownloader;

  private readonly benchmark: ModelBenchmark;

  private currentPlan: ModelSelectionPlan | null = null;

  private activePlan: ActiveModelPlan | null = null;

  private readonly installedModels = new Map<string, InstalledModel>();

  public constructor(
    private readonly options: ModelManagerOptions,
    registry = defaultModelRegistry,
    downloader = new ModelDownloader(),
    benchmark = new ModelBenchmark(),
  ) {
    this.selector = new ModelSelector(registry);

    this.compatibility = new ModelCompatibility();

    this.downloader = downloader;
    this.benchmark = benchmark;
  }

  /*
   * --------------------------------------------------------------------------
   * Hardware -> model selection
   * --------------------------------------------------------------------------
   */

  public createSelectionPlan(profile: HardwareProfile): ModelSelectionPlan {
    const plan = this.selector.select(profile, this.options.selection);

    this.currentPlan = plan;

    return plan;
  }

  public getSelectionPlan(): ModelSelectionPlan | null {
    return this.currentPlan;
  }

  /*
   * --------------------------------------------------------------------------
   * Model lookup
   * --------------------------------------------------------------------------
   */

  public getModel(modelId: string): ModelDefinition {
    return defaultModelRegistry.require(modelId);
  }

  public evaluateModel(
    modelId: string,
    profile: HardwareProfile,
  ): ModelCompatibilityResult {
    const model = defaultModelRegistry.require(modelId);

    return this.compatibility.evaluate(model, profile);
  }

  /*
   * --------------------------------------------------------------------------
   * Installation
   * --------------------------------------------------------------------------
   */

  public async install(
    modelId: string,
    options: ModelInstallOptions = {},
  ): Promise<ModelInstallResult> {
    const model = defaultModelRegistry.require(modelId);

    if (model.availability !== "available") {
      throw new Error(
        `Model "${modelId}" is not currently available for installation.`,
      );
    }

    const downloadOptions: ModelDownloadOptions = {
      destinationDirectory: this.options.modelDirectory,
      overwrite: options.overwrite ?? false,
      signal: options.signal,
      onProgress: options.onProgress,
    };

    const download = await this.downloader.download(model, downloadOptions);

    const installed: InstalledModel = Object.freeze({
      modelId: model.id,
      filePath: download.filePath,
      installedAt: Date.now(),
      sizeBytes: download.bytesDownloaded,
      sha256: download.sha256,
    });

    this.installedModels.set(model.id, installed);

    let benchmarkResult: ModelBenchmarkResult | undefined;

    if (options.benchmarkAfterInstall) {
      benchmarkResult = await this.benchmarkModel(modelId, options.benchmark);
    }

    return Object.freeze({
      download,
      benchmark: benchmarkResult,
    });
  }

  public async uninstall(modelId: string): Promise<void> {
    const installed = this.installedModels.get(modelId);

    if (!installed) {
      return;
    }

    await this.downloader.remove(installed.filePath);

    this.installedModels.delete(modelId);
  }

  public isInstalled(modelId: string): boolean {
    return this.installedModels.has(modelId);
  }

  public getInstalled(modelId: string): InstalledModel | undefined {
    return this.installedModels.get(modelId);
  }

  public listInstalled(): readonly InstalledModel[] {
    return [...this.installedModels.values()];
  }

  /*
   * --------------------------------------------------------------------------
   * Benchmarking
   * --------------------------------------------------------------------------
   */

  public async benchmarkModel(
    modelId: string,
    options?: ModelBenchmarkOptions,
  ): Promise<ModelBenchmarkResult> {
    const model = defaultModelRegistry.require(modelId);

    return this.benchmark.benchmark(model, options);
  }

  public getBenchmark(modelId: string): ModelBenchmarkResult | undefined {
    return this.benchmark.getResult(modelId);
  }

  /*
   * --------------------------------------------------------------------------
   * Activation
   * --------------------------------------------------------------------------
   */

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

    return defaultModelRegistry.get(modelId) ?? null;
  }

  public getFallbackModels(
    modality: ModelModality,
  ): readonly ModelDefinition[] {
    const ids = this.activePlan?.fallbacks[modality] ?? [];

    return ids
      .map((id) => defaultModelRegistry.get(id))
      .filter((model): model is ModelDefinition => model !== undefined);
  }

  /*
   * --------------------------------------------------------------------------
   * Recommended installation
   * --------------------------------------------------------------------------
   */

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

    return recommended;
  }

  /*
   * --------------------------------------------------------------------------
   * Reset
   * --------------------------------------------------------------------------
   */

  public clearPlans(): void {
    this.currentPlan = null;
    this.activePlan = null;
  }
}

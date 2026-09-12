// core/models/runtime/ModelRuntimeManager.ts

import type {
  ModelDefinition,
  ModelModality,
  ModelRuntime as ModelRuntimeKind,
} from "../ModelRegistry";

import { MemoryPressureGuard } from "../installation/MemoryPressureGuard";

import type { ModelStorage } from "../storage/ModelStorage";

import type {
  InferenceRuntime,
  ModelRuntime,
  ModelRuntimeGenerateOptions,
  ModelRuntimeGenerationResult,
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  OnnxRuntimeRunOptions,
  OnnxRuntimeRunResult,
  SpeechRecognitionOptions,
  SpeechRecognitionResult,
  SpeechRecognitionRuntime,
  SpeechSynthesisOptions,
  SpeechSynthesisResult,
  SpeechSynthesisRuntime,
  TextGenerationRuntime,
  VisionGenerationOptions,
  VisionGenerationRuntime,
} from "./ModelRuntime";

import { RuntimeRegistry, type ModelRuntimeFactory } from "./RuntimeRegistry";

export interface ModelRuntimeManagerOptions {
  readonly storage: ModelStorage;

  readonly runtimeRegistry?: RuntimeRegistry;

  readonly memoryPressureGuard?: MemoryPressureGuard;
}

export interface RuntimeLoadResult {
  readonly modelId: string;

  readonly runtimeName: string;

  readonly canLoad: boolean;

  readonly memoryShortfallBytes: number;

  readonly warnings: readonly string[];
}

export class ModelRuntimeManager {
  private readonly runtimeRegistry: RuntimeRegistry;

  private readonly storage: ModelStorage;

  private readonly memoryPressureGuard: MemoryPressureGuard;

  private activeRuntime: ModelRuntime | null = null;

  private activeModel: ModelDefinition | null = null;

  private disposed = false;

  public constructor(options: ModelRuntimeManagerOptions) {
    this.storage = options.storage;

    this.runtimeRegistry = options.runtimeRegistry ?? new RuntimeRegistry();

    this.memoryPressureGuard =
      options.memoryPressureGuard ?? new MemoryPressureGuard();
  }

  /**
   * ==========================================================================
   * Registration
   * ==========================================================================
   */

  public registerRuntime(runtime: ModelRuntime): void {
    this.ensureNotDisposed();

    const name = runtime.name.trim();

    if (!name) {
      throw new Error("Cannot register a runtime without a name.");
    }

    this.runtimeRegistry.register(name as ModelRuntimeKind, () => runtime);
  }

  public registerRuntimeFactory(
    runtimeKind: ModelRuntimeKind,
    factory: ModelRuntimeFactory,
  ): void {
    this.ensureNotDisposed();

    this.runtimeRegistry.register(runtimeKind, factory);
  }

  public replaceRuntimeFactory(
    runtimeKind: ModelRuntimeKind,
    factory: ModelRuntimeFactory,
  ): void {
    this.ensureNotDisposed();

    this.runtimeRegistry.replace(runtimeKind, factory);
  }

  public async unregisterRuntime(runtimeKind: ModelRuntimeKind): Promise<void> {
    this.ensureNotDisposed();

    if (this.activeRuntime?.name === runtimeKind) {
      await this.unload();
    }

    this.runtimeRegistry.unregister(runtimeKind);
  }

  public getRuntime(runtimeKind: ModelRuntimeKind): ModelRuntime {
    this.ensureNotDisposed();

    return this.runtimeRegistry.get(runtimeKind);
  }

  public listRuntimes(): readonly string[] {
    return Object.freeze(
      this.runtimeRegistry.listRegistered().map(String).sort(),
    );
  }

  /**
   * ==========================================================================
   * Support / preparation
   * ==========================================================================
   */

  public supportsModel(model: ModelDefinition): boolean {
    if (this.disposed) {
      return false;
    }

    return this.runtimeRegistry.supports(model);
  }

  public async prepareLoad(model: ModelDefinition): Promise<RuntimeLoadResult> {
    this.ensureNotDisposed();

    const runtime = this.resolveRuntime(model);

    const memory = this.memoryPressureGuard.inspectModel(model);

    const warnings: string[] = [];

    const stored = await this.storage.getStoredModel(model);

    if (!stored) {
      warnings.push(
        `Model "${model.displayName}" is not installed or failed integrity verification.`,
      );
    }

    if (!memory.safe) {
      warnings.push(
        `Current memory availability is insufficient to safely load "${model.displayName}".`,
      );
    }

    if (
      model.capabilities.visionUnderstanding &&
      !stored?.artifactPaths.mmproj
    ) {
      warnings.push(
        `Vision model "${model.displayName}" is missing its required mmproj artifact.`,
      );
    }

    const runtimeArtifactsReady =
      stored !== null &&
      this.requiredRuntimeArtifactsPresent(model, stored.artifactPaths);

    if (stored && !runtimeArtifactsReady) {
      warnings.push(
        `The installed package for "${model.displayName}" does not contain all runtime-required artifacts.`,
      );
    }

    return Object.freeze({
      modelId: model.id,

      runtimeName: runtime.name,

      canLoad: stored !== null && memory.safe && runtimeArtifactsReady,

      memoryShortfallBytes: memory.shortfallBytes,

      warnings: Object.freeze(warnings),
    });
  }

  /**
   * ==========================================================================
   * Load
   * ==========================================================================
   */

  public async load(
    model: ModelDefinition,
    options: Omit<ModelRuntimeLoadOptions, "modelPath"> = {},
  ): Promise<void> {
    this.ensureNotDisposed();

    const runtime = this.resolveRuntime(model);

    const memory = this.memoryPressureGuard.inspectModel(model);

    if (!memory.safe) {
      throw new Error(
        `Cannot load "${model.displayName}" because current memory pressure is too high. ` +
          `${memory.shortfallBytes} bytes of additional safe memory are required.`,
      );
    }

    const stored = await this.storage.getStoredModel(model);

    if (!stored) {
      throw new Error(
        `Cannot load "${model.displayName}" because no verified installation exists.`,
      );
    }

    if (!this.requiredRuntimeArtifactsPresent(model, stored.artifactPaths)) {
      throw new Error(
        `Cannot load "${model.displayName}" because the installed package is missing runtime-required artifacts.`,
      );
    }

    /*
     * Only one heavyweight runtime is active at a time.
     */
    await this.unload();

    try {
      await runtime.load(model, {
        ...options,

        modelPath: stored.artifactPath,

        artifactPaths: stored.artifactPaths,
      });

      const health = await runtime.health();

      if (!health.ready) {
        await runtime.unload();

        throw new Error(
          `Runtime "${runtime.name}" did not become healthy after loading "${model.displayName}".`,
        );
      }

      this.activeRuntime = runtime;

      this.activeModel = model;
    } catch (error) {
      this.activeRuntime = null;

      this.activeModel = null;

      throw error;
    }
  }

  /**
   * ==========================================================================
   * Unload / disposal
   * ==========================================================================
   */

  public async unload(): Promise<void> {
    const runtime = this.activeRuntime;

    this.activeRuntime = null;

    this.activeModel = null;

    if (!runtime) {
      return;
    }

    await runtime.unload();
  }

  public async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    let firstError: unknown = undefined;

    try {
      await this.unload();
    } catch (error) {
      firstError = error;
    }

    try {
      await this.runtimeRegistry.unloadAll();
    } catch (error) {
      if (firstError === undefined) {
        firstError = error;
      }
    }

    if (firstError !== undefined) {
      throw firstError;
    }
  }

  /**
   * ==========================================================================
   * Active state
   * ==========================================================================
   */

  public getActiveModel(): ModelDefinition | null {
    return this.activeModel;
  }

  public getActiveRuntime(): ModelRuntime | null {
    return this.activeRuntime;
  }

  public getActiveModality(): ModelModality | null {
    return this.activeModel?.modality ?? null;
  }

  public async health(): Promise<ModelRuntimeHealth> {
    const runtime = this.activeRuntime;

    if (!runtime) {
      return Object.freeze({
        ready: false,

        loadedModelId: this.activeModel?.id ?? null,

        runtimeName: "none",
      });
    }

    return runtime.health();
  }

  /**
   * ==========================================================================
   * Text
   * ==========================================================================
   */

  public async generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    this.ensureNotDisposed();

    return this.requireTextRuntime().generate(options);
  }

  /**
   * ==========================================================================
   * Vision
   * ==========================================================================
   */

  public async generateVision(
    options: VisionGenerationOptions,
  ): Promise<ModelRuntimeGenerationResult> {
    this.ensureNotDisposed();

    return this.requireVisionRuntime().generateVision(options);
  }

  /**
   * ==========================================================================
   * STT
   * ==========================================================================
   */

  public async transcribe(
    options: SpeechRecognitionOptions,
  ): Promise<SpeechRecognitionResult> {
    this.ensureNotDisposed();

    return this.requireSpeechRuntime().transcribe(options);
  }

  /**
   * ==========================================================================
   * Generic ONNX
   * ==========================================================================
   */

  public async run(
    options: OnnxRuntimeRunOptions,
  ): Promise<OnnxRuntimeRunResult> {
    this.ensureNotDisposed();

    return this.requireInferenceRuntime().run(options);
  }

  /**
   * ==========================================================================
   * TTS
   * ==========================================================================
   */

  public async synthesize(
    options: SpeechSynthesisOptions,
  ): Promise<SpeechSynthesisResult> {
    this.ensureNotDisposed();

    return this.requireSpeechSynthesisRuntime().synthesize(options);
  }

  /**
   * ==========================================================================
   * Runtime resolution
   * ==========================================================================
   */

  private resolveRuntime(model: ModelDefinition): ModelRuntime {
    const runtime = this.runtimeRegistry.resolveForModel(model);

    if (!runtime.supports(model)) {
      throw new Error(
        `Runtime "${runtime.name}" does not support model "${model.id}".`,
      );
    }

    return runtime;
  }

  /**
   * ==========================================================================
   * Runtime artifact requirements
   * ==========================================================================
   */

  private requiredRuntimeArtifactsPresent(
    model: ModelDefinition,
    artifactPaths: Readonly<Record<string, string>> | undefined,
  ): boolean {
    if (!artifactPaths?.model) {
      return false;
    }

    if (model.capabilities.visionUnderstanding && !artifactPaths.mmproj) {
      return false;
    }

    if (model.capabilities.speechRecognition && !artifactPaths.model) {
      return false;
    }

    if (model.capabilities.textToSpeech && !artifactPaths.model) {
      return false;
    }

    return true;
  }

  /**
   * ==========================================================================
   * Type guards
   * ==========================================================================
   */

  private requireTextRuntime(): TextGenerationRuntime {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error("No model is currently loaded.");
    }

    if (!this.isTextRuntime(runtime)) {
      throw new Error(
        `The active runtime "${runtime.name}" does not support text generation.`,
      );
    }

    return runtime;
  }

  private requireVisionRuntime(): VisionGenerationRuntime {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error("No model is currently loaded.");
    }

    if (!this.isVisionRuntime(runtime)) {
      throw new Error(
        `The active runtime "${runtime.name}" does not support vision generation.`,
      );
    }

    return runtime;
  }

  private requireSpeechRuntime(): SpeechRecognitionRuntime {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error("No speech recognition model is currently loaded.");
    }

    if (!this.isSpeechRuntime(runtime)) {
      throw new Error(
        `The active runtime "${runtime.name}" does not support speech recognition.`,
      );
    }

    return runtime;
  }

  private requireInferenceRuntime(): InferenceRuntime {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error("No inference model is currently loaded.");
    }

    if (!this.isInferenceRuntime(runtime)) {
      throw new Error(
        `The active runtime "${runtime.name}" does not support ONNX inference.`,
      );
    }

    return runtime;
  }

  private requireSpeechSynthesisRuntime(): SpeechSynthesisRuntime {
    const runtime = this.activeRuntime;

    if (!runtime) {
      throw new Error("No text-to-speech model is currently loaded.");
    }

    if (!this.isSpeechSynthesisRuntime(runtime)) {
      throw new Error(
        `The active runtime "${runtime.name}" does not support text-to-speech.`,
      );
    }

    return runtime;
  }

  private isTextRuntime(
    runtime: ModelRuntime,
  ): runtime is TextGenerationRuntime {
    return "generate" in runtime && typeof runtime.generate === "function";
  }

  private isVisionRuntime(
    runtime: ModelRuntime,
  ): runtime is VisionGenerationRuntime {
    return (
      "generateVision" in runtime &&
      typeof runtime.generateVision === "function"
    );
  }

  private isSpeechRuntime(
    runtime: ModelRuntime,
  ): runtime is SpeechRecognitionRuntime {
    return "transcribe" in runtime && typeof runtime.transcribe === "function";
  }

  private isInferenceRuntime(
    runtime: ModelRuntime,
  ): runtime is InferenceRuntime {
    return "run" in runtime && typeof runtime.run === "function";
  }

  private isSpeechSynthesisRuntime(
    runtime: ModelRuntime,
  ): runtime is SpeechSynthesisRuntime {
    return "synthesize" in runtime && typeof runtime.synthesize === "function";
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("ModelRuntimeManager has already been disposed.");
    }
  }
}
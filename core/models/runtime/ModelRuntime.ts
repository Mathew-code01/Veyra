// core/models/runtime/ModelRuntime.ts
// core/models/runtime/ModelRuntime.ts

import type { ModelDefinition } from "../ModelRegistry";

export interface ModelRuntimeLoadOptions {
  readonly modelPath: string;

  readonly contextSize?: number;

  readonly gpuLayers?: number;

  readonly threads?: number;

  readonly batchSize?: number;

  readonly signal?: AbortSignal;
}

export interface ModelRuntimeGenerateOptions {
  readonly prompt: string;

  readonly maxTokens?: number;

  readonly temperature?: number;

  readonly topP?: number;

  readonly signal?: AbortSignal;

  readonly onToken?: (token: string) => void;
}

export interface ModelRuntimeGenerationResult {
  readonly text: string;

  readonly promptTokens?: number;

  readonly completionTokens?: number;

  readonly durationMs: number;

  readonly firstTokenMs?: number;

  readonly tokensPerSecond?: number;
}

export interface ModelRuntimeHealth {
  readonly ready: boolean;

  readonly loadedModelId: string | null;

  readonly runtimeName: string;

  readonly runtimeVersion?: string;
}

export interface ModelRuntime {
  readonly name: string;

  supports(model: ModelDefinition): boolean;

  load(
    model: ModelDefinition,
    options: ModelRuntimeLoadOptions,
  ): Promise<void>;

  health(): Promise<ModelRuntimeHealth>;

  unload(): Promise<void>;
}

export interface TextGenerationRuntime
  extends ModelRuntime {
  generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult>;
}

export interface SpeechRecognitionOptions {
  readonly audioFilePath: string;

  readonly language?: string;

  readonly threads?: number;

  readonly signal?: AbortSignal;
}

export interface SpeechRecognitionResult {
  readonly text: string;

  readonly durationMs: number;

  readonly language?: string;
}

export interface SpeechRecognitionRuntime
  extends ModelRuntime {
  transcribe(
    options: SpeechRecognitionOptions,
  ): Promise<SpeechRecognitionResult>;
}

export interface OnnxRuntimeRunOptions {
  readonly feeds: Record<string, unknown>;

  readonly fetches?: readonly string[];

  readonly signal?: AbortSignal;
}

export interface OnnxRuntimeRunResult {
  readonly outputs: Record<string, unknown>;

  readonly durationMs: number;
}

export interface InferenceRuntime
  extends ModelRuntime {
  run(
    options: OnnxRuntimeRunOptions,
  ): Promise<OnnxRuntimeRunResult>;
}
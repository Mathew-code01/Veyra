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

  load(model: ModelDefinition, options: ModelRuntimeLoadOptions): Promise<void>;

  generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult>;

  health(): Promise<ModelRuntimeHealth>;

  unload(): Promise<void>;
}
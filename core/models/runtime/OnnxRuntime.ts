// core/models/runtime/OnnxRuntime.ts

import * as ort from "onnxruntime-node";

import { promises as fs } from "node:fs";

import type { ModelDefinition } from "../ModelRegistry";

import type {
  InferenceRuntime,
  ModelRuntimeHealth,
  ModelRuntimeLoadOptions,
  OnnxRuntimeRunOptions,
  OnnxRuntimeRunResult,
} from "./ModelRuntime";

type OnnxSession = ort.InferenceSession;

type OnnxSessionOptions = Parameters<typeof ort.InferenceSession.create>[1];

export interface OnnxRuntimeOptions {
  readonly sessionOptions?: OnnxSessionOptions;
}

export class OnnxRuntime implements InferenceRuntime {
  public readonly name = "onnx";

  private readonly sessions = new Map<string, OnnxSession>();

  private readonly modelPaths = new Map<string, string>();

  public constructor(private readonly options: OnnxRuntimeOptions = {}) {}

  public supports(model: ModelDefinition): boolean {
    return model.runtime === "onnx";
  }

  public async load(
    model: ModelDefinition,
    options: ModelRuntimeLoadOptions,
  ): Promise<void> {
    if (!this.supports(model)) {
      throw new Error(`OnnxRuntime cannot execute runtime "${model.runtime}".`);
    }

    if (options.signal?.aborted) {
      throw new DOMException("ONNX load was aborted.", "AbortError");
    }

    const modelPath = options.modelPath.trim();

    if (!modelPath) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

    await fs.access(modelPath);

    await this.unload(model);

    const session = await ort.InferenceSession.create(
      modelPath,
      this.options.sessionOptions,
    );

    this.sessions.set(model.id, session);

    this.modelPaths.set(model.id, modelPath);
  }

  public async run(
    options: OnnxRuntimeRunOptions,
  ): Promise<OnnxRuntimeRunResult> {
    if (!options || typeof options !== "object") {
      throw new Error("ONNX inference options are required.");
    }

    const modelId = this.getSingleLoadedModelId();

    const session = this.sessions.get(modelId);

    if (!session) {
      throw new Error("No ONNX model is currently loaded.");
    }

    if (options.signal?.aborted) {
      throw new DOMException("ONNX inference was aborted.", "AbortError");
    }

    const startedAt = Date.now();

    const feeds = options.feeds;

    if (!feeds || typeof feeds !== "object") {
      throw new Error("ONNX inference requires input feeds.");
    }

    const result = await session.run(
      feeds as ort.InferenceSession["inputMetadata"] extends never
        ? never
        : Record<string, ort.Tensor>,
      options.fetches ? [...options.fetches] : undefined,
    );

    return Object.freeze({
      outputs: result as Record<string, unknown>,

      durationMs: Date.now() - startedAt,
    });
  }

  public async health(): Promise<ModelRuntimeHealth> {
    const modelId = this.getLoadedModelId();

    return Object.freeze({
      ready: modelId !== null,

      loadedModelId: modelId,

      runtimeName: this.name,
    });
  }

  public async unload(model?: ModelDefinition): Promise<void> {
    if (model) {
      const session = this.sessions.get(model.id);

      if (session) {
        await session.release();
      }

      this.sessions.delete(model.id);

      this.modelPaths.delete(model.id);

      return;
    }

    for (const session of this.sessions.values()) {
      await session.release();
    }

    this.sessions.clear();
    this.modelPaths.clear();
  }

  private getLoadedModelId(): string | null {
    const first = this.sessions.keys().next();

    return first.done ? null : String(first.value);
  }

  private getSingleLoadedModelId(): string {
    const modelId = this.getLoadedModelId();

    if (!modelId) {
      throw new Error("No ONNX model is currently loaded.");
    }

    if (this.sessions.size > 1) {
      throw new Error(
        "OnnxRuntime currently expects exactly one active session for inference.",
      );
    }

    return modelId;
  }
}

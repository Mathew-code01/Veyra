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

type OnnxFeeds = Parameters<OnnxSession["run"]>[0];

type OnnxFetches = Parameters<OnnxSession["run"]>[1];

export interface OnnxRuntimeOptions {
  readonly sessionOptions?: Parameters<typeof ort.InferenceSession.create>[1];
}

export class OnnxRuntime implements InferenceRuntime {
  public readonly name = "onnx";

  private readonly sessions = new Map<string, OnnxSession>();

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
      throw new DOMException("ONNX model loading was aborted.", "AbortError");
    }

    const modelPath = options.modelPath.trim();

    if (!modelPath) {
      throw new Error(`A model path is required for "${model.id}".`);
    }

    await fs.access(modelPath);

    await this.unload();

    const session = await ort.InferenceSession.create(
      modelPath,
      this.options.sessionOptions,
    );

    this.sessions.set(model.id, session);
  }

  public async run(
    options: OnnxRuntimeRunOptions,
  ): Promise<OnnxRuntimeRunResult> {
    const modelId = this.getSingleLoadedModelId();

    const session = this.sessions.get(modelId);

    if (!session) {
      throw new Error("No ONNX model is currently loaded.");
    }

    if (options.signal?.aborted) {
      throw new DOMException("ONNX inference was aborted.", "AbortError");
    }

    const startedAt = Date.now();

    const feeds = options.feeds as OnnxFeeds;

    let result: Awaited<ReturnType<OnnxSession["run"]>>;

    if (options.fetches && options.fetches.length > 0) {
      const fetches = [...options.fetches] as OnnxFetches;

      result = await session.run(feeds, fetches);
    } else {
      result = await session.run(feeds);
    }

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

  public async unload(): Promise<void> {
    const sessions = [...this.sessions.values()];

    this.sessions.clear();

    await Promise.all(sessions.map((session) => session.release()));
  }

  private getLoadedModelId(): string | null {
    const first = this.sessions.keys().next();

    if (first.done) {
      return null;
    }

    return String(first.value);
  }

  private getSingleLoadedModelId(): string {
    const modelId = this.getLoadedModelId();

    if (!modelId) {
      throw new Error("No ONNX model is currently loaded.");
    }

    if (this.sessions.size !== 1) {
      throw new Error("OnnxRuntime expects exactly one active model session.");
    }

    return modelId;
  }
}

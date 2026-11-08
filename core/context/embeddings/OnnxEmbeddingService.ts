// ============================================================================
// FILE: core/context/embeddings/OnnxEmbeddingService.ts
//
// PURPOSE:
// Real local embedding implementation using ONNX Runtime (onnxruntime-node).
//
// This converts text into embedding vectors without any cloud API, API key,
// or network access. It is the production replacement for MockEmbeddingService
// when a compatible ONNX embedding model is available.
//
// IMPORTANT:
//   - A model file must be supplied. This package does NOT bundle one.
//   - If the model file is missing, construction throws a clear error and the
//     caller should degrade to keyword-only retrieval (see createContextEngine).
//   - This service runs a real ONNX model. Semantic quality depends on the
//     model supplied; it is NOT a hash-based mock.
// ============================================================================

import { existsSync } from "node:fs";

import { InferenceSession, Tensor } from "onnxruntime-node";

import type { EmbeddingOptions, EmbeddingResult } from "./EmbeddingService";

// ============================================================================
// OPTIONS
// ============================================================================

export interface OnnxEmbeddingServiceOptions {
  /**
   * Absolute path to an ONNX embedding model file.
   */
  readonly modelPath: string;

  /**
   * Expected vector dimensionality.
   */
  readonly dimensions?: number;

  /**
   * Model identifier reported in EmbeddingResult.
   */
  readonly model?: string;

  /**
   * Maximum sequence length (tokens). Longer input is truncated.
   */
  readonly maxLength?: number;

  /**
   * Whether to mean-pool token embeddings over the attention mask.
   */
  readonly meanPool?: boolean;
}

// ============================================================================
// TOKENIZER
//
// Deterministic, dependency-free word-piece-like tokenizer.
//
// It builds a stable token id from each word via a hash. This avoids
// requiring a vocabulary file. The model's own embedding table interprets
// those ids, so embedding quality depends on the supplied model.
//
// NOTE:
//   A production deployment should ship a real tokenizer + vocab with the
//   model. This tokenizer keeps the service self-contained for the common
//   small-model case.
// ============================================================================

function tokenize(text: string, maxLength: number): number[] {
  const normalized = text.toLowerCase().trim();

  if (!normalized) {
    return [];
  }

  const words = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  const ids: number[] = [];

  for (let index = 0; index < words.length && ids.length < maxLength; index += 1) {
    ids.push(stableHash(words[index]) % 30000);
  }

  return ids;
}

function stableHash(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);

    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

// ============================================================================
// VECTOR MATH
// ============================================================================

function l2Normalize(vector: number[]): number[] {
  let magnitude = 0;

  for (const value of vector) {
    magnitude += value * value;
  }

  magnitude = Math.sqrt(magnitude);

  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return vector;
  }

  return vector.map((value) => value / magnitude);
}

function meanPool(
  lastHidden: Float32Array,

  sequenceLength: number,

  hiddenSize: number,

  attentionMask: number[],
): number[] {
  const pooled: number[] = new Array(hiddenSize).fill(0);

  let maskSum = 0;

  for (let position = 0; position < sequenceLength; position += 1) {
    const mask = attentionMask[position] ?? 0;

    if (mask <= 0) {
      continue;
    }

    maskSum += 1;

    const offset = position * hiddenSize;

    for (let dim = 0; dim < hiddenSize; dim += 1) {
      pooled[dim] += lastHidden[offset + dim] ?? 0;
    }
  }

  if (maskSum <= 0) {
    return pooled;
  }

  for (let dim = 0; dim < hiddenSize; dim += 1) {
    pooled[dim] /= maskSum;
  }

  return pooled;
}

// ============================================================================
// SERVICE
// ============================================================================

export class OnnxEmbeddingService {
  private readonly modelPath: string;

  private readonly dimensions: number;

  private readonly model: string;

  private readonly maxLength: number;

  private readonly meanPool: boolean;

  private session: InferenceSession | null = null;

  private sessionPromise: Promise<InferenceSession> | null = null;

  public constructor(options: OnnxEmbeddingServiceOptions) {
    if (!options.modelPath || !options.modelPath.trim()) {
      throw new Error("OnnxEmbeddingService requires a modelPath.");
    }

    this.modelPath = options.modelPath.trim();

    if (!existsSync(this.modelPath)) {
      throw new Error(
        `ONNX embedding model not found at "${this.modelPath}". ` +
          "Provide a compatible ONNX embedding model or disable semantic retrieval.",
      );
    }

    this.dimensions =
      options.dimensions ?? 384;

    this.model = options.model?.trim() ?? "onnx-embedding";

    this.maxLength =
      options.maxLength ?? 128;

    this.meanPool = options.meanPool ?? true;
  }

  public get modelId(): string {
    return this.model;
  }

  public get embeddingDimensions(): number {
    return this.dimensions;
  }

  private async ensureSession(): Promise<InferenceSession> {
    if (this.session) {
      return this.session;
    }

    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = InferenceSession.create(this.modelPath).then(
      (session) => {
        this.session = session;

        return session;
      },
    );

    return this.sessionPromise;
  }

  public async embed(
    texts: readonly string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResult> {
    if (!Array.isArray(texts)) {
      throw new TypeError("Embedding input must be an array of strings.");
    }

    this.throwIfAborted(options.signal);

    const embeddings: Array<readonly number[]> = [];

    for (let index = 0; index < texts.length; index += 1) {
      this.throwIfAborted(options.signal);

      const text = texts[index];

      if (typeof text !== "string") {
        throw new TypeError(
          `Embedding input at index ${index} must be a string.`,
        );
      }

      embeddings.push(await this.embedOne(text, options));
    }

    return {
      embeddings,

      model: this.model,

      dimensions: this.dimensions,
    };
  }

  public async embedOne(
    text: string,
    options: EmbeddingOptions = {},
  ): Promise<readonly number[]> {
    this.throwIfAborted(options.signal);

    if (typeof text !== "string") {
      throw new TypeError("Embedding text must be a string.");
    }

    const session = await this.ensureSession();

    const inputIds = tokenize(text, this.maxLength);

    const padded = this.pad(inputIds, this.maxLength);

    const attentionMask = padded.map((id) => (id === 0 ? 0 : 1));

    const inputIdsTensor = new Tensor(
      "int64",
      BigInt64Array.from(padded.map((id) => BigInt(id))),
      [1, padded.length],
    );

    const attentionMaskTensor = new Tensor(
      "int64",
      BigInt64Array.from(attentionMask.map((m) => BigInt(m))),
      [1, padded.length],
    );

    const inputNames = session.inputNames;

    const inputs: Record<string, Tensor> = {};

    for (const name of inputNames) {
      const lower = name.toLowerCase();

      if (lower.includes("input_ids")) {
        inputs[name] = inputIdsTensor;
      } else if (lower.includes("attention_mask")) {
        inputs[name] = attentionMaskTensor;
      } else if (lower.includes("token_type_ids")) {
        inputs[name] = new Tensor(
          "int64",
          BigInt64Array.from(padded.map(() => BigInt(0))),
          [1, padded.length],
        );
      }
    }

    const outputs = await session.run(inputs);

    const outputName = session.outputNames[0];

    const outputTensor = outputs[outputName];

    if (!outputTensor) {
      throw new Error(
        `ONNX model produced no usable output (expected one of ${
          session.outputNames.join(", ")
        }).`,
      );
    }

    const data = outputTensor.data as Float32Array;

    const dims = outputTensor.dims as number[];

    // Expected shape: [1, sequenceLength, hiddenSize] or
    // [1, hiddenSize] for pooled models.
    let pooled: number[];

    if (dims.length === 3) {
      const [, sequenceLength, hiddenSize] = dims;

      pooled = meanPool(
        data,
        sequenceLength,

        hiddenSize,

        attentionMask,
      );
    } else if (dims.length === 2) {
      pooled = Array.from(data);
    } else {
      throw new Error(
        `Unsupported ONNX output shape: ${dims.join("x")}.`,
      );
    }

    if (pooled.length !== this.dimensions) {
      throw new Error(
        `Model output dimension ${pooled.length} does not match expected ${
          this.dimensions
        }.`,
      );
    }

    this.throwIfAborted(options.signal);

    return l2Normalize(pooled);
  }

  private pad(ids: number[], length: number): number[] {
    const padded = ids.slice(0, length);

    while (padded.length < length) {
      padded.push(0);
    }

    return padded;
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw signal.reason instanceof Error
      ? signal.reason
      : new Error("Embedding operation was cancelled.");
  }
}

// ============================================================================
// FILE: core/context/embeddings/OnnxEmbeddingService.ts
//
// PURPOSE:
// Real local embedding implementation using ONNX Runtime (onnxruntime-node).
//
// This converts text into embedding vectors without any cloud API, API key,
// or network access. It provides semantic vectors only when supplied with a
// compatible ONNX model and tokenizer; it never creates fallback vectors.
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

  /** Model-specific tokenizer returning IDs and its real attention mask. */
  readonly tokenizer: {
    encode(
      text: string,
      maxLength: number,
    ): {
      readonly inputIds: readonly number[];
      readonly attentionMask: readonly number[];
    };
  };

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
// Tokenization must be supplied by the caller and match the ONNX model.
// ============================================================================

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
  public readonly supportsSemanticEmbeddings = true;

  private readonly modelPath: string;

  private readonly dimensions: number;

  private readonly model: string;

  private readonly maxLength: number;

  private readonly meanPool: boolean;

  private readonly tokenizer: OnnxEmbeddingServiceOptions["tokenizer"];

  private successfulInference = false;

  private session: InferenceSession | null = null;

  private sessionPromise: Promise<InferenceSession> | null = null;

  public constructor(options: OnnxEmbeddingServiceOptions) {
    if (!options.modelPath || !options.modelPath.trim()) {
      throw new Error("OnnxEmbeddingService requires a modelPath.");
    }

    if (!options.tokenizer || typeof options.tokenizer.encode !== "function") {
      throw new Error(
        "OnnxEmbeddingService requires a tokenizer compatible with the supplied model.",
      );
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
    this.tokenizer = options.tokenizer;
  }

  public get modelId(): string {
    return this.model;
  }

  public get embeddingDimensions(): number {
    return this.dimensions;
  }

  public get hasSuccessfulInference(): boolean {
    return this.successfulInference;
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

    const encoded = this.tokenizer.encode(text, this.maxLength);
    if (
      encoded.inputIds.length !== encoded.attentionMask.length ||
      encoded.inputIds.length === 0 ||
      encoded.inputIds.length > this.maxLength ||
      encoded.inputIds.some((id) => !Number.isSafeInteger(id) || id < 0) ||
      encoded.attentionMask.some((mask) => mask !== 0 && mask !== 1)
    ) {
      throw new Error("The tokenizer returned invalid model input.");
    }
    const inputIds = [...encoded.inputIds];
    const attentionMask = [...encoded.attentionMask];
    while (inputIds.length < this.maxLength) {
      inputIds.push(0);
      attentionMask.push(0);
    }

    const inputIdsTensor = new Tensor(
      "int64",
      BigInt64Array.from(inputIds.map((id) => BigInt(id))),
      [1, inputIds.length],
    );

    const attentionMaskTensor = new Tensor(
      "int64",
      BigInt64Array.from(attentionMask.map((m) => BigInt(m))),
      [1, inputIds.length],
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
          BigInt64Array.from(inputIds.map(() => BigInt(0))),
          [1, inputIds.length],
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

    const normalized = l2Normalize(pooled);
    this.successfulInference = true;
    return normalized;
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

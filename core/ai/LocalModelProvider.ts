// core/ai/LocalModelProvider.ts

import type { ModelDefinition } from "../models/ModelRegistry";

import type { ModelManager } from "../models/ModelManager";

import type {
  ModelRuntimeGenerateOptions,
  ModelRuntimeGenerationResult,
} from "../models/runtime/ModelRuntime";

import type { AIMessage, AIRequest } from "./AIRequest";

import type { AIProvider, AIProviderHealth } from "./AIProvider";

import type { AIResponse, AIStreamChunk } from "./AIResponse";

import { AIError } from "./AIError";

/**
 * ============================================================================
 * Configuration
 * ============================================================================
 */

/**
 * Configuration for the local Veyra model provider.
 */
export interface LocalModelProviderOptions {
  /**
   * Provider name exposed to AIManager/AIRouter.
   */
  readonly name?: string;

  /**
   * Optional default model ID.
   *
   * Used when AIRequest.model is not supplied.
   */
  readonly defaultModelId?: string;

  /**
   * Whether the provider may automatically install
   * a model when it has not been installed yet.
   *
   * Disabled by default to prevent accidental large downloads.
   */
  readonly autoInstall?: boolean;

  /**
   * Installation priority when autoInstall is enabled.
   */
  readonly installationPriority?: number;

  /**
   * Default runtime tuning.
   */
  readonly contextSize?: number;

  readonly gpuLayers?: number;

  readonly threads?: number;

  readonly batchSize?: number;
}

/**
 * ============================================================================
 * Internal request representation
 * ============================================================================
 */

interface ResolvedLocalRequest {
  readonly model: ModelDefinition;

  readonly messages: readonly AIMessage[];

  readonly prompt: string;
}

/**
 * ============================================================================
 * Helpers
 * ============================================================================
 */

/**
 * Convert a conversation into the prompt expected by the
 * current llama.cpp runtime adapter.
 *
 * The runtime currently exposes a single `prompt` field.
 *
 * We preserve system/user/assistant roles explicitly so
 * multi-turn conversations do not lose their semantic roles.
 */
function messagesToPrompt(messages: readonly AIMessage[]): string {
  if (messages.length === 0) {
    throw new AIError(
      "AI request must contain at least one message.",
      "INVALID_REQUEST",
    );
  }

  return messages
    .map((message) => {
      const content = message.content.trim();

      if (!content) {
        return "";
      }

      switch (message.role) {
        case "system":
          return `System:\n${content}`;

        case "assistant":
          return `Assistant:\n${content}`;

        case "user":
          return `User:\n${content}`;

        default:
          return content;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Abort helper shared by all provider operations.
 */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Operation was aborted.", "AbortError");
  }
}

/**
 * Safely convert an unknown error to a message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * ============================================================================
 * Local Veyra model provider
 * ============================================================================
 *
 * This class is the bridge between:
 *
 *   core/ai
 *       ↓
 *   LocalModelProvider
 *       ↓
 *   ModelManager
 *       ↓
 *   ModelRuntimeManager
 *       ↓
 *   RuntimeRegistry
 *       ↓
 *   llama.cpp / whisper.cpp / ONNX / etc.
 *
 * IMPORTANT:
 *
 * This class intentionally does NOT import:
 *
 * - LlamaCppRuntime
 * - RuntimeRegistry
 * - ModelStorage
 * - ModelInstallationManager
 * - ModelDownloader
 *
 * ModelManager remains the public model facade.
 */
export class LocalModelProvider implements AIProvider {
  public readonly name: string;

  public readonly capabilities = Object.freeze({
    streaming: true,

    vision: true,

    structuredOutput: true,

    local: true,
  });

  private readonly options: LocalModelProviderOptions;

  public constructor(
    private readonly modelManager: ModelManager,

    options: LocalModelProviderOptions = {},
  ) {
    this.options = Object.freeze({
      ...options,
    });

    this.name = options.name?.trim() || "local";
  }

  // ==========================================================================
  // Generation
  // ==========================================================================

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startedAt = Date.now();

    try {
      const resolved = await this.resolveRequest(request);

      throwIfAborted(request.signal);

      const generationOptions = this.createGenerationOptions(
        request,
        resolved.prompt,
      );

      let result: ModelRuntimeGenerationResult;

      if (request.vision) {
        result = await this.generateVision(request, resolved);
      } else {
        result = await this.modelManager.generate(generationOptions);
      }

      return Object.freeze({
        text: result.text,

        metadata: Object.freeze({
          provider: this.name,

          model: resolved.model.id,

          requestId: request.requestId,

          latencyMs: Date.now() - startedAt,

          usage: this.createUsage(result),

          details: Object.freeze({
            runtime: this.modelManager.getActiveRuntime()?.name,

            durationMs: result.durationMs,

            firstTokenMs: result.firstTokenMs,

            tokensPerSecond: result.tokensPerSecond,
          }),
        }),
      });
    } catch (error) {
      throw this.toAIError(error, request);
    }
  }

  // ==========================================================================
  // Streaming
  // ==========================================================================

  public stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    return this.createStream(request);
  }

  private async *createStream(
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    let resolved: ResolvedLocalRequest | undefined;

    try {
      resolved = await this.resolveRequest(request);

      throwIfAborted(request.signal);

      const queue: string[] = [];

      const waiters: Array<(result: IteratorResult<string>) => void> = [];

      let completed = false;

      let generationError: unknown | undefined;

      const push = (token: string): void => {
        if (!token) {
          return;
        }

        const waiter = waiters.shift();

        if (waiter) {
          waiter({
            done: false,
            value: token,
          });

          return;
        }

        queue.push(token);
      };

      const finish = (): void => {
        if (completed) {
          return;
        }

        completed = true;

        while (waiters.length > 0) {
          const waiter = waiters.shift();

          waiter?.({
            done: true,
            value: undefined,
          });
        }
      };

      const nextToken = (): Promise<IteratorResult<string>> => {
        if (queue.length > 0) {
          return Promise.resolve({
            done: false,
            value: queue.shift()!,
          });
        }

        if (completed) {
          return Promise.resolve({
            done: true,
            value: undefined,
          });
        }

        return new Promise((resolve) => {
          waiters.push(resolve);
        });
      };

      const generationOptions = this.createGenerationOptions(
        request,
        resolved.prompt,
        push,
      );

      /**
       * Start generation without
       * awaiting it.
       *
       * Tokens are transferred through
       * the internal async queue above.
       */
      const generationPromise = request.vision
        ? this.generateVision(request, resolved, push)
        : this.modelManager.generate(generationOptions);

      void generationPromise
        .catch((error) => {
          generationError = error;
        })
        .finally(() => {
          finish();
        });

      while (true) {
        throwIfAborted(request.signal);

        const item = await nextToken();

        if (item.done) {
          break;
        }

        yield Object.freeze({
          text: item.value,

          requestId: request.requestId,

          provider: this.name,

          model: resolved.model.id,

          done: false,
        });
      }

      if (generationError) {
        throw generationError;
      }

      /**
       * Make sure generation itself
       * has completed successfully.
       */
      await generationPromise;

      yield Object.freeze({
        text: "",

        requestId: request.requestId,

        provider: this.name,

        model: resolved.model.id,

        done: true,

        finishReason: "stop",
      });
    } catch (error) {
      throw this.toAIError(error, request, resolved?.model.id);
    }
  }

  // ==========================================================================
  // Health
  // ==========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<AIProviderHealth> {
    const startedAt = Date.now();

    try {
      throwIfAborted(signal);

      const health = await this.modelManager.getRuntimeHealth();

      return Object.freeze({
        provider: this.name,

        status: health.ready ? "healthy" : "unavailable",

        latencyMs: Date.now() - startedAt,

        checkedAt: Date.now(),

        model: health.loadedModelId ?? undefined,

        runtime: health.runtimeName,

        details: Object.freeze({
          ready: health.ready,

          loadedModelId: health.loadedModelId,
        }),
      });
    } catch (error) {
      return Object.freeze({
        provider: this.name,

        status: "unavailable",

        latencyMs: Date.now() - startedAt,

        checkedAt: Date.now(),

        error: getErrorMessage(error),
      });
    }
  }

  // ==========================================================================
  // Request resolution
  // ==========================================================================

  private async resolveRequest(
    request: AIRequest,
  ): Promise<ResolvedLocalRequest> {
    throwIfAborted(request.signal);

    if (!request.messages || request.messages.length === 0) {
      throw new AIError(
        "AI request must contain at least one message.",
        "INVALID_REQUEST",
      );
    }

    const prompt = messagesToPrompt(request.messages);

    if (!prompt.trim()) {
      throw new AIError(
        "AI request contains no usable message content.",
        "INVALID_REQUEST",
      );
    }

    const modelId =
      request.model?.trim() ||
      this.options.defaultModelId?.trim() ||
      this.modelManager.getLoadedModel()?.id;

    if (!modelId) {
      throw new AIError(
        "No local model was specified and no local model is currently loaded.",
        "MODEL_NOT_FOUND",
      );
    }

    const model = this.modelManager.getModel(modelId);

    /**
     * The local AI provider currently
     * handles generative text and
     * vision models.
     *
     * STT/TTS/embedding models are
     * consumed by specialized
     * subsystems.
     */
    if (model.modality !== "llm" && model.modality !== "vision") {
      throw new AIError(
        `Model "${model.id}" has modality "${model.modality}" and cannot be used for text generation.`,
        "MODEL_UNSUPPORTED",
        {
          details: {
            model: model.id,
          },
        },
      );
    }

    /**
     * Runtime support is delegated to
     * ModelManager.
     *
     * LocalModelProvider never talks
     * directly to RuntimeRegistry.
     */
    if (!this.modelManager.supportsModel(model.id)) {
      throw AIError.modelUnsupported(model.id);
    }

    /**
     * Do not silently download large
     * models unless autoInstall has
     * explicitly been enabled.
     */
    if (!this.modelManager.isInstalled(model.id)) {
      if (!this.options.autoInstall) {
        throw AIError.modelNotInstalled(model.id);
      }

      throwIfAborted(request.signal);

      await this.modelManager.install(model.id, {
        priority: this.options.installationPriority ?? 0,

        signal: request.signal,
      });
    }

    throwIfAborted(request.signal);

    /**
     * Ensure the requested model is
     * the active runtime model.
     */
    const loaded = this.modelManager.getLoadedModel();

    if (!loaded || loaded.id !== model.id) {
      await this.modelManager.loadModel(model.id, {
        contextSize: this.options.contextSize,

        gpuLayers: this.options.gpuLayers,

        threads: this.options.threads,

        batchSize: this.options.batchSize,

        signal: request.signal,
      });
    }

    return Object.freeze({
      model,

      messages: request.messages,

      prompt,
    });
  }

  // ==========================================================================
  // Generation options
  // ==========================================================================

  private createGenerationOptions(
    request: AIRequest,
    prompt: string,
    onToken?: (token: string) => void,
  ): ModelRuntimeGenerateOptions {
    return {
      prompt,

      maxTokens: request.options?.maxTokens,

      temperature: request.options?.temperature,

      topP: request.options?.topP,

      signal: request.signal,

      onToken,
    };
  }

  // ==========================================================================
  // Vision
  // ==========================================================================

  private async generateVision(
    request: AIRequest,
    resolved: ResolvedLocalRequest,
    onToken?: (token: string) => void,
  ): Promise<ModelRuntimeGenerationResult> {
    const vision = request.vision;

    if (!vision) {
      throw new AIError("Vision request data is missing.", "INVALID_REQUEST");
    }

    const hasImagePath = Boolean(vision.imagePath?.trim());

    const hasImageDataUrl = Boolean(vision.imageDataUrl?.trim());

    if (hasImagePath && hasImageDataUrl) {
      throw new AIError(
        "Provide either imagePath or imageDataUrl, not both.",
        "INVALID_REQUEST",
      );
    }

    if (!hasImagePath && !hasImageDataUrl) {
      throw new AIError(
        "Vision requests require imagePath or imageDataUrl.",
        "INVALID_REQUEST",
      );
    }

    if (
      resolved.model.modality !== "vision" &&
      !resolved.model.capabilities.visionUnderstanding
    ) {
      throw new AIError(
        `Model "${resolved.model.id}" does not support vision understanding.`,
        "MODEL_UNSUPPORTED",
        {
          details: {
            model: resolved.model.id,
          },
        },
      );
    }

    throwIfAborted(request.signal);

    return this.modelManager.generateVision({
      prompt: resolved.prompt,

      imagePath: vision.imagePath,

      imageDataUrl: vision.imageDataUrl,

      imageMimeType: vision.imageMimeType,

      maxTokens: request.options?.maxTokens,

      temperature: request.options?.temperature,

      topP: request.options?.topP,

      signal: request.signal,

      onToken,
    });
  }

  // ==========================================================================
  // Usage
  // ==========================================================================

  private createUsage(result: ModelRuntimeGenerationResult) {
    if (
      result.promptTokens === undefined &&
      result.completionTokens === undefined
    ) {
      return undefined;
    }

    const inputTokens = result.promptTokens;

    const outputTokens = result.completionTokens;

    const totalTokens =
      inputTokens !== undefined && outputTokens !== undefined
        ? inputTokens + outputTokens
        : undefined;

    return Object.freeze({
      inputTokens,

      outputTokens,

      totalTokens,
    });
  }

  // ==========================================================================
  // Error mapping
  // ==========================================================================

  private toAIError(
    error: unknown,
    request: AIRequest,
    modelId?: string,
  ): AIError {
    if (error instanceof AIError) {
      return error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      return new AIError("Local AI request was aborted.", "ABORTED", {
        details: {
          provider: this.name,

          model: modelId ?? request.model,
        },

        cause: error,
      });
    }

    const message = getErrorMessage(error);

    const lower = message.toLowerCase();

    if (lower.includes("not installed")) {
      return new AIError(message, "MODEL_NOT_INSTALLED", {
        details: {
          provider: this.name,

          model: modelId ?? request.model,
        },

        cause: error,
      });
    }

    if (lower.includes("not found")) {
      return new AIError(message, "MODEL_NOT_FOUND", {
        details: {
          provider: this.name,

          model: modelId ?? request.model,
        },

        cause: error,
      });
    }

    if (lower.includes("unsupported")) {
      return new AIError(message, "MODEL_UNSUPPORTED", {
        details: {
          provider: this.name,

          model: modelId ?? request.model,
        },

        cause: error,
      });
    }

    return new AIError(message, "PROVIDER", {
      retryable: false,

      details: {
        provider: this.name,

        model: modelId ?? request.model,
      },

      cause: error,
    });
  }
}

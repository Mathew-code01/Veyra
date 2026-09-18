
// ============================================================================
// FILE: core/ai/CloudAIProvider.ts
// PURPOSE:
// Adapter between Veyra's generic AIProvider abstraction and the cloud
// infrastructure.
//
// RESPONSIBILITIES:
// - Translate AIRequest -> CloudRequest
// - Execute through CloudGateway
// - Translate CloudResponse -> AIResponse
// - Translate CloudStream -> AIStreamChunk
// - Expose cloud capabilities to AIManager
// - Expose cloud health to AIManager
//
// NON-RESPONSIBILITIES:
// - Interview reasoning
// - Context selection
// - Provider ranking
// - Candidate-data selection
// - Prompt policy
// - Retry policy
// - Circuit breaking
//
// Those responsibilities belong elsewhere.
//
// ARCHITECTURE:
//
// AIManager
//    |
//    +--> LocalModelProvider
//    |
//    +--> CloudAIProvider
//              |
//              +--> CloudGateway
//                       |
//                       +--> CloudProvider
//
// CloudAIProvider is therefore an adapter, not a second AI architecture.
//
// IMPORTANT:
//
// AIResponse is the shared core contract for BOTH:
//
// - LocalModelProvider
// - CloudAIProvider
//
// CloudAIProvider must therefore never introduce cloud-only response shapes
// into core/ai.
// ============================================================================

import type {
  AIProvider,
  AIProviderCapabilities,
  AIProviderHealth,
} from "./AIProvider";

import type { AIRequest } from "./AIRequest";

import type {
  AIEmbeddingResponse,
  AIResponse,
  AIResponseMetadata,
  AIStreamChunk,
  AITextResponse,
} from "./AIResponse";

import { AIError, type AIErrorCode } from "./AIError";

import { CloudGateway } from "../cloud/CloudGateway";

import type {
  CloudRequest,
  CloudExecutionOptions,
} from "../cloud/contracts/CloudRequest";

import type { CloudResponse } from "../cloud/contracts/CloudResponse";

import type {
  CloudStream,
  CloudStreamEvent,
} from "../cloud/contracts/CloudStream";

import type { CloudProviderRegistry } from "../cloud/CloudProviderRegistry";

import { CloudError } from "../cloud/contracts/CloudError";

// ============================================================================
// TYPES
// ============================================================================

export interface CloudAIProviderOptions {
  /**
   * Provider used when this CloudAIProvider instance executes a request.
   *
   * This class intentionally does not perform provider routing.
   */
  readonly providerId: string;

  /**
   * Optional shared gateway.
   */
  readonly gateway?: CloudGateway;

  /**
   * Optional registry used when a gateway is not supplied.
   */
  readonly registry?: CloudProviderRegistry;

  /**
   * Optional display name.
   */
  readonly name?: string;
}

// ============================================================================
// CLOUD AI PROVIDER
// ============================================================================

export class CloudAIProvider implements AIProvider {
  public readonly name: string;

  public readonly capabilities: AIProviderCapabilities;

  private readonly providerId: string;

  private readonly gateway: CloudGateway;

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  public constructor(options: CloudAIProviderOptions) {
    const providerId = options.providerId.trim();

    if (!providerId) {
      throw new Error("CloudAIProvider requires a non-empty providerId.");
    }

    this.providerId = providerId;

    this.gateway =
      options.gateway ?? this.createGatewayFromRegistry(options.registry);

    this.name = options.name ?? `cloud:${providerId}`;

    const provider = options.registry?.tryGet(providerId);

    this.capabilities = {
      streaming: provider?.capabilities.streaming ?? true,

      vision: provider?.capabilities.vision ?? false,

      structuredOutput: provider?.capabilities.structuredOutput ?? false,

      local: false,
    };
  }

  // ==========================================================================
  // REGISTRY -> GATEWAY
  // ==========================================================================

  private createGatewayFromRegistry(
    registry: CloudProviderRegistry | undefined,
  ): CloudGateway {
    if (!registry) {
      throw new Error(
        "CloudAIProvider requires either a CloudGateway or CloudProviderRegistry.",
      );
    }

    return new CloudGateway(registry);
  }

  // ==========================================================================
  // GENERATE
  // ==========================================================================

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startedAt = Date.now();

    try {
      const cloudRequest = this.toCloudRequest(request);

      const response = await this.gateway.execute(
        this.providerId,
        cloudRequest,
        this.toCloudExecutionOptions(request),
      );

      return this.toAIResponse(response, request, Date.now() - startedAt);
    } catch (error) {
      throw this.toAIError(error, request);
    }
  }

  // ==========================================================================
  // STREAM
  // ==========================================================================

  public stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const cloudRequest = this.toCloudRequest(request);

    let stream: CloudStream;

    try {
      stream = this.gateway.stream(
        this.providerId,
        cloudRequest,
        this.toCloudExecutionOptions(request),
      );
    } catch (error) {
      throw this.toAIError(error, request);
    }

    return this.transformStream(stream, request);
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<AIProviderHealth> {
    const startedAt = Date.now();

    if (signal?.aborted) {
      return {
        provider: this.name,

        status: "unavailable",

        latencyMs: 0,

        checkedAt: Date.now(),

        error: "Health check was aborted.",

        runtime: "cloud",

        details: {
          providerId: this.providerId,

          signalAborted: true,
        },
      };
    }

    try {
      /**
       * Because CloudGateway has overloads, supplying providerId returns
       * CloudHealth directly rather than CloudHealth | CloudHealth[].
       */
      const health = await this.gateway.healthCheck(this.providerId);

      return {
        provider: this.name,

        status: this.mapHealthStatus(health.status),

        latencyMs: health.latencyMs ?? Date.now() - startedAt,

        checkedAt: health.checkedAt ?? Date.now(),

        error: health.error,

        runtime: "cloud",

        details: {
          providerId: this.providerId,

          ...(health.details ?? {}),

          modelsAvailable: health.modelsAvailable,

          signalAborted: signal?.aborted ?? false,
        },
      };
    } catch (error) {
      const aiError = this.toAIError(error);

      return {
        provider: this.name,

        status: "unavailable",

        latencyMs: Date.now() - startedAt,

        checkedAt: Date.now(),

        error: aiError.message,

        runtime: "cloud",

        details: {
          providerId: this.providerId,

          errorCode: aiError.code,

          retryable: aiError.retryable,

          signalAborted: signal?.aborted ?? false,
        },
      };
    }
  }

  // ==========================================================================
  // REQUEST TRANSLATION
  // ==========================================================================

  private toCloudRequest(request: AIRequest): CloudRequest {
    /**
     * CloudRequest and AIRequest intentionally share the generic AI payload
     * shape at this adapter boundary.
     *
     * Transport-specific interpretation remains inside core/cloud.
     *
     * The cast is isolated here because the two layers intentionally expose
     * different public contracts even though their generic request payloads
     * overlap.
     */
    return {
      ...request,
    } as unknown as CloudRequest;
  }

  // ==========================================================================
  // EXECUTION OPTIONS
  // ==========================================================================

  private toCloudExecutionOptions(request: AIRequest): CloudExecutionOptions {
    const candidate = request as unknown as Record<string, unknown>;

    const options: Record<string, unknown> = {};

    const signal = candidate["signal"];

    if (
      typeof signal === "object" &&
      signal !== null &&
      typeof (
        signal as {
          aborted?: unknown;
        }
      ).aborted === "boolean"
    ) {
      options["signal"] = signal;
    }

    const timeoutMs = candidate["timeoutMs"];

    if (
      typeof timeoutMs === "number" &&
      Number.isFinite(timeoutMs) &&
      timeoutMs > 0
    ) {
      options["timeoutMs"] = timeoutMs;
    }

    return options as CloudExecutionOptions;
  }

  // ==========================================================================
  // RESPONSE TRANSLATION
  // ==========================================================================

  private toAIResponse(
    response: CloudResponse,
    request: AIRequest,
    latencyMs: number,
  ): AIResponse {
    const requestRecord = this.asRecord(request);

    const model =
      this.normalizeString(response.model) ??
      this.extractString(requestRecord, "model") ??
      "unknown";

    const requestId =
      this.normalizeString(response.requestId) ??
      this.extractString(requestRecord, "requestId") ??
      this.createFallbackRequestId();

    const metadata = this.createResponseMetadata(
      response,
      model,
      requestId,
      latencyMs,
    );

    // ------------------------------------------------------------------------
    // TEXT-LIKE RESPONSES
    // ------------------------------------------------------------------------

    switch (response.type) {
      case "text_generation":
      case "vision":
      case "speech_to_text":
      case "document_analysis": {
        const text = this.normalizeString(response.text);

        if (text === undefined) {
          throw this.createInvalidResponseError(
            "Cloud provider returned a text response without text.",
            model,
            requestId,
          );
        }

        const result: AITextResponse = {
          type: response.type,

          text,

          metadata,
        };

        return Object.freeze(result);
      }

      // ----------------------------------------------------------------------
      // EMBEDDING
      // ----------------------------------------------------------------------

      case "embedding": {
        const embeddings = this.normalizeEmbeddings(response.embeddings);

        if (embeddings.length === 0) {
          throw this.createInvalidResponseError(
            "Cloud provider returned an embedding response without embeddings.",
            model,
            requestId,
          );
        }

        const dimensions = response.dimensions;

        if (!Number.isInteger(dimensions) || dimensions <= 0) {
          throw this.createInvalidResponseError(
            `Cloud provider returned invalid embedding dimensions: ${String(
              dimensions,
            )}.`,
            model,
            requestId,
          );
        }

        for (const embedding of embeddings) {
          if (embedding.length !== dimensions) {
            throw this.createInvalidResponseError(
              `Cloud provider returned an embedding vector with ${embedding.length} dimensions; expected ${dimensions}.`,
              model,
              requestId,
            );
          }
        }

        /**
         * Keep embeddings as a first-class AI response.
         *
         * This is part of the shared core/ai contract and therefore works
         * consistently for cloud and future local embedding providers.
         */
        const result: AIEmbeddingResponse = {
          type: "embedding",

          embeddings,

          dimensions,

          metadata,
        };

        /**
         * Deep-freeze the vectors at the AI boundary so consumers cannot
         * mutate provider-owned response data.
         */
        return Object.freeze({
          ...result,

          embeddings: Object.freeze(
            embeddings.map((embedding) => Object.freeze(embedding)),
          ),
        });
      }

      // ----------------------------------------------------------------------
      // TEXT TO SPEECH
      // ----------------------------------------------------------------------

      case "text_to_speech":
        /**
         * AIResponse currently represents textual and embedding results.
         *
         * TTS has a binary audio payload and therefore must not be silently
         * converted to text or JSON.
         *
         * It will receive a dedicated AI audio response contract when the
         * generic audio response layer is introduced.
         */
        throw this.createInvalidResponseError(
          "Cloud provider returned a text-to-speech response, but the generic AIResponse contract does not yet support audio responses.",
          model,
          requestId,
        );

      // ----------------------------------------------------------------------
      // EXHAUSTIVENESS
      // ----------------------------------------------------------------------

      default: {
        const exhaustiveResponse: never = response;

        throw this.createInvalidResponseError(
          `Cloud provider returned unsupported response type: ${String(
            exhaustiveResponse,
          )}.`,
          model,
          requestId,
        );
      }
    }
  }

  // ==========================================================================
  // RESPONSE METADATA
  // ==========================================================================

  private createResponseMetadata(
    response: CloudResponse,
    model: string,
    requestId: string,
    latencyMs: number,
  ): AIResponseMetadata {
    /**
     * CloudResponse is a discriminated union.
     *
     * Most response variants expose `usage`, but CloudTextToSpeechResponse
     * intentionally does not.
     *
     * Therefore we must narrow the union before accessing `usage`.
     *
     * This keeps the cloud contract honest instead of adding a meaningless
     * optional usage field to response types that cannot provide it.
     */
    const usage =
      "usage" in response ? this.mapUsage(response.usage) : undefined;

    const details: Record<string, unknown> = {
      runtime: "cloud",

      providerId: this.providerId,
    };

    let finishReason: string | undefined;

    if (response.type === "text_generation" || response.type === "vision") {
      finishReason = response.finishReason;
    }

    if (response.type === "speech_to_text") {
      if (response.language !== undefined) {
        details["language"] = response.language;
      }

      if (response.durationSeconds !== undefined) {
        details["durationSeconds"] = response.durationSeconds;
      }

      if (response.segments !== undefined) {
        details["segmentCount"] = response.segments.length;
      }
    }

    if (response.type === "embedding") {
      details["embeddingDimensions"] = response.dimensions;

      details["embeddingCount"] = response.embeddings.length;
    }

    return Object.freeze({
      provider: this.name,

      model,

      requestId,

      latencyMs,

      ...(finishReason !== undefined
        ? {
            finishReason,
          }
        : {}),

      ...(usage !== undefined
        ? {
            usage,
          }
        : {}),

      details: Object.freeze(details),
    });
  }

  // ==========================================================================
  // EMBEDDING NORMALIZATION
  // ==========================================================================

  private normalizeEmbeddings(
    value: readonly (readonly number[])[],
  ): number[][] {
    if (!Array.isArray(value)) {
      return [];
    }

    const embeddings: number[][] = [];

    for (const embedding of value) {
      if (!Array.isArray(embedding)) {
        return [];
      }

      const normalized: number[] = [];

      for (const value of embedding) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          return [];
        }

        normalized.push(value);
      }

      embeddings.push(normalized);
    }

    return embeddings;
  }

  // ==========================================================================
  // INVALID RESPONSE ERROR
  // ==========================================================================

  private createInvalidResponseError(
    message: string,
    model?: string,
    requestId?: string,
  ): AIError {
    return new AIError(`${this.name}: ${message}`, "INVALID_RESPONSE", {
      retryable: false,

      details: {
        provider: this.name,

        model,

        runtime: "cloud",

        /**
         * AIErrorDetails does not expose requestId as a top-level field.
         *
         * Keep cloud-specific request correlation information inside the
         * generic nested details record.
         */
        details: {
          providerId: this.providerId,

          ...(requestId !== undefined
            ? {
                requestId,
              }
            : {}),
        },
      },
    });
  }

  // ==========================================================================
  // STREAM TRANSLATION
  // ==========================================================================

  private async *transformStream(
    stream: CloudStream,
    request: AIRequest,
  ): AsyncIterable<AIStreamChunk> {
    const requestRecord = this.asRecord(request);

    const requestId =
      this.extractString(requestRecord, "requestId") ??
      this.createFallbackRequestId();

    const fallbackModel =
      this.extractString(requestRecord, "model") ?? "unknown";

    try {
      for await (const chunk of stream) {
        const translated = this.toAIStreamChunk(
          chunk,
          requestId,
          fallbackModel,
        );

        /**
         * Metadata-only cloud events do not need to be exposed as AI text
         * chunks.
         */
        if (translated) {
          yield translated;
        }
      }
    } catch (error) {
      throw this.toAIError(error, request);
    }
  }

  // ==========================================================================
  // STREAM EVENT TRANSLATION
  // ==========================================================================

  private toAIStreamChunk(
    chunk: CloudStreamEvent,
    requestId: string,
    fallbackModel: string,
  ): AIStreamChunk | null {
    const chunkRecord = this.asRecord(chunk);

    const eventType = this.extractString(chunkRecord, "type");

    const model = this.extractString(chunkRecord, "model") ?? fallbackModel;

    const eventRequestId =
      this.extractString(chunkRecord, "requestId") ?? requestId;

    const data = chunkRecord["data"];

    const dataRecord = this.asRecord(data);

    const text =
      this.extractString(dataRecord, "text") ??
      this.extractString(chunkRecord, "text") ??
      "";

    const finishReason =
      this.extractString(dataRecord, "finishReason") ??
      this.extractString(dataRecord, "finish_reason") ??
      this.extractString(chunkRecord, "finishReason");

    switch (eventType) {
      // ----------------------------------------------------------------------
      // TEXT
      // ----------------------------------------------------------------------

      case "text_delta":
        return {
          text,

          requestId: eventRequestId,

          provider: this.name,

          model,

          done: false,

          ...(finishReason !== undefined
            ? {
                finishReason,
              }
            : {}),
        };

      // ----------------------------------------------------------------------
      // DONE
      // ----------------------------------------------------------------------

      case "done":
        return {
          text,

          requestId: eventRequestId,

          provider: this.name,

          model,

          done: true,

          ...(finishReason !== undefined
            ? {
                finishReason,
              }
            : {}),
        };

      // ----------------------------------------------------------------------
      // METADATA
      // ----------------------------------------------------------------------

      case "metadata":
        /**
         * Generic AIStreamChunk deliberately does not expose provider-specific
         * metadata events.
         */
        return null;

      // ----------------------------------------------------------------------
      // UNKNOWN
      // ----------------------------------------------------------------------

      default:
        /**
         * Transport-specific events must not leak into core/ai.
         */
        return null;
    }
  }

  // ==========================================================================
  // USAGE MAPPING
  // ==========================================================================

  private mapUsage(
    value: unknown,
  ):
    | {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      }
    | undefined {
    const usage = this.asRecord(value);

    if (Object.keys(usage).length === 0) {
      return undefined;
    }

    const inputTokens =
      this.extractNumber(usage, "inputTokens") ??
      this.extractNumber(usage, "promptTokens") ??
      this.extractNumber(usage, "prompt_tokens");

    const outputTokens =
      this.extractNumber(usage, "outputTokens") ??
      this.extractNumber(usage, "completionTokens") ??
      this.extractNumber(usage, "completion_tokens");

    const totalTokens =
      this.extractNumber(usage, "totalTokens") ??
      this.extractNumber(usage, "total_tokens");

    if (
      inputTokens === undefined &&
      outputTokens === undefined &&
      totalTokens === undefined
    ) {
      return undefined;
    }

    return {
      ...(inputTokens !== undefined
        ? {
            inputTokens,
          }
        : {}),

      ...(outputTokens !== undefined
        ? {
            outputTokens,
          }
        : {}),

      ...(totalTokens !== undefined
        ? {
            totalTokens,
          }
        : {}),
    };
  }

  // ==========================================================================
  // HEALTH MAPPING
  // ==========================================================================

  private mapHealthStatus(status: unknown): AIProviderHealth["status"] {
    switch (status) {
      case "healthy":
        return "healthy";

      case "degraded":
        return "degraded";

      case "unavailable":
        return "unavailable";

      /**
       * Cloud has a disabled state while the generic AI health contract
       * represents this as unavailable.
       */
      case "disabled":
        return "unavailable";

      case "unknown":
        return "unknown";

      default:
        return "unknown";
    }
  }

  // ==========================================================================
  // ERROR TRANSLATION
  // ==========================================================================

  private toAIError(error: unknown, request?: AIRequest): AIError {
    if (error instanceof AIError) {
      return error;
    }

    const requestRecord = request ? this.asRecord(request) : {};

    const model = this.extractString(requestRecord, "model");

    // ------------------------------------------------------------------------
    // CLOUD ERROR
    // ------------------------------------------------------------------------

    if (error instanceof CloudError) {
      return this.cloudErrorToAIError(error, model);
    }

    // ------------------------------------------------------------------------
    // ABORTED
    // ------------------------------------------------------------------------

    if (error instanceof DOMException && error.name === "AbortError") {
      return new AIError(`${this.name}: AI request was aborted.`, "ABORTED", {
        retryable: false,

        details: {
          provider: this.name,

          model,

          runtime: "cloud",
        },

        cause: error,
      });
    }

    // ------------------------------------------------------------------------
    // GENERIC ERROR
    // ------------------------------------------------------------------------

    if (error instanceof Error) {
      return new AIError(`${this.name}: ${error.message}`, "PROVIDER", {
        retryable: false,

        details: {
          provider: this.name,

          model,

          runtime: "cloud",
        },

        cause: error,
      });
    }

    // ------------------------------------------------------------------------
    // UNKNOWN VALUE
    // ------------------------------------------------------------------------

    return new AIError(`${this.name}: ${String(error)}`, "PROVIDER", {
      retryable: false,

      details: {
        provider: this.name,

        model,

        runtime: "cloud",
      },

      cause: error,
    });
  }

  // ==========================================================================
  // CLOUD ERROR -> AI ERROR
  // ==========================================================================

  private cloudErrorToAIError(error: CloudError, model?: string): AIError {
    /**
     * CloudError and AIError use the same canonical error code.
     *
     * No semantic error-code remapping is performed here.
     */
    const code: AIErrorCode = error.code;

    return new AIError(`${this.name}: ${error.message}`, code, {
      retryable: error.retryable,

      details: {
        provider: this.name,

        model,

        runtime: "cloud",

        status: error.statusCode,

        retryAfterMs: this.extractRetryAfterMs(error),

        cause: error.cause,

        /**
         * IMPORTANT:
         *
         * `providerId` is cloud-specific metadata and therefore belongs
         * inside the nested generic details record.
         *
         * It must NOT be placed directly on AIErrorDetails.
         */
        details: {
          providerId: error.providerId,

          requestId: error.requestId,

          ...(error.details ?? {}),
        },
      },

      cause: error,
    });
  }

  // ==========================================================================
  // RETRY-AFTER EXTRACTION
  // ==========================================================================

  private extractRetryAfterMs(error: CloudError): number | undefined {
    const details = error.details;

    if (!details || typeof details !== "object") {
      return undefined;
    }

    const record = details as Record<string, unknown>;

    const value = record["retryAfterMs"] ?? record["retry_after_ms"];

    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : undefined;
  }

  // ==========================================================================
  // STRUCTURAL HELPERS
  // ==========================================================================

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private extractString(
    record: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = record[key];

    return typeof value === "string" && value.trim().length > 0
      ? value
      : undefined;
  }

  private normalizeString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private extractNumber(
    record: Record<string, unknown>,
    key: string,
  ): number | undefined {
    const value = record[key];

    return typeof value === "number" && Number.isFinite(value)
      ? value
      : undefined;
  }

  // ==========================================================================
  // REQUEST ID FALLBACK
  // ==========================================================================

  private createFallbackRequestId(): string {
    return `${this.providerId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }
}
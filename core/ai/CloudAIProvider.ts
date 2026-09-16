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
// ============================================================================

import type {
  AIProvider,
  AIProviderCapabilities,
  AIProviderHealth,
} from "./AIProvider";

import type { AIRequest } from "./AIRequest";

import type { AIResponse, AIStreamChunk } from "./AIResponse";

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
       * Because CloudGateway now has overloads, supplying providerId returns
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
    const responseRecord = this.asRecord(response);

    const requestRecord = this.asRecord(request);

    const text = this.extractString(responseRecord, "text");

    /**
     * A generic AIResponse must contain text.
     *
     * CloudResponse may contain transport-level response variants, so do not
     * silently turn an incompatible response into an empty successful answer.
     */
    if (text === undefined) {
      throw new AIError(
        `${this.name}: Cloud provider returned a response without text.`,
        "INVALID_RESPONSE",
        {
          retryable: false,

          details: {
            provider: this.name,

            runtime: "cloud",

            details: {
              providerId: this.providerId,
            },
          },
        },
      );
    }

    const model =
      this.extractString(responseRecord, "model") ??
      this.extractString(requestRecord, "model") ??
      "unknown";

    const requestId =
      this.extractString(responseRecord, "requestId") ??
      this.extractString(requestRecord, "requestId") ??
      this.createFallbackRequestId();

    const finishReason = this.extractString(responseRecord, "finishReason");

    const usage = this.mapUsage(responseRecord["usage"]);

    const details: Record<string, unknown> = {
      runtime: "cloud",

      providerId: this.providerId,
    };

    return {
      text,

      metadata: {
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

        details,
      },
    };
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

  private mapUsage(value: unknown):
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
     * CloudError and AIError now use the exact same canonical ErrorCode type.
     *
     * Therefore there is NO semantic remapping here.
     *
     * Example:
     *
     *   CloudError("RATE_LIMIT")
     *          |
     *          v
     *   AIError("RATE_LIMIT")
     *
     * Likewise:
     *
     *   CloudError("QUOTA_EXCEEDED")
     *          |
     *          v
     *   AIError("QUOTA_EXCEEDED")
     *
     * This prevents the adapter from accidentally changing the meaning of
     * an error while crossing the cloud -> AI boundary.
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

// ============================================================================
// FILE: core/cloud/providers/Cerebras/CerebrasProvider.ts
// PURPOSE:
// Production Cerebras cloud provider adapter for Veyra.
//
// SUPPORTED:
// - Text generation
// - Streaming text generation
// - Structured output capability metadata
// - Tool-calling capability metadata
// - Health checks
//
// NOT SUPPORTED:
// - Vision
// - Speech-to-text
// - Text-to-speech
// - Embeddings
// - Document analysis
//
// API:
// https://api.cerebras.ai/v1/chat/completions
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";
import type { CloudProviderConfig } from "../../CloudProviderConfig";
import type { CloudCapabilities } from "../../CloudCapabilities";
import type { CloudModel } from "../../CloudModel";

import { CEREBRAS_MODELS } from "./CerebrasModels";

import type {
  CloudRequest,
  CloudExecutionOptions,
  CloudMessage,
} from "../../contracts/CloudRequest";

import type {
  CloudResponse,
  CloudTextResponse,
} from "../../contracts/CloudResponse";

import type { CloudStream } from "../../contracts/CloudStream";

import type { CloudHealth } from "../../contracts/CloudHealth";

import { CloudError } from "../../contracts/CloudError";

import { CloudHttpClient } from "../../CloudHttpClient";

import {
  resolveCredential,
  resolveModel,
  assertCapability,
  createAuthorizationHeaders,
  createStream,
  type CloudProviderDependencies,
} from "../../CloudProviderSupport";

// ============================================================================
// PROVIDER
// ============================================================================

export class CerebrasProvider implements CloudProvider {
  public readonly id = "cerebras";

  public readonly name = "Cerebras";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: false,
    speechToText: false,
    textToSpeech: false,
    embeddings: false,
    documentAnalysis: false,
    structuredOutput: true,
    toolCalling: true,
  });

  public readonly models: readonly CloudModel[] = CEREBRAS_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "cerebras") {
      throw new CloudError(
        `CerebrasProvider requires provider ID "cerebras", received "${config.id}".`,
        "CONFIGURATION",
        {
          providerId: "cerebras",
        },
      );
    }

    this.config = config;

    this.http = dependencies.http ?? new CloudHttpClient();

    if (!dependencies.credentialResolver) {
      throw new CloudError(
        "CerebrasProvider requires a credential resolver.",
        "CONFIGURATION",
        {
          providerId: this.id,
        },
      );
    }

    this.credentialResolver = dependencies.credentialResolver;
  }

  // ==========================================================================
  // EXECUTION
  // ==========================================================================

  public async execute(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    if (request.type !== "text_generation") {
      throw new CloudError(
        `Cerebras does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          providerId: this.id,
          retryable: false,
        },
      );
    }

    return this.generate(request, options);
  }

  // ==========================================================================
  // NON-STREAMING GENERATION
  // ==========================================================================

  private async generate(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation";
      }
    >,
    options: CloudExecutionOptions,
  ): Promise<CloudTextResponse> {
    assertCapability(this.capabilities, "textGeneration", this.id);

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.json<CerebrasResponse>({
      url: `${this.baseUrl()}/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: {
        model: model.modelId,

        messages: this.toMessages(request.messages),

        ...(request.options?.temperature !== undefined
          ? {
              temperature: request.options.temperature,
            }
          : {}),

        ...(request.options?.topP !== undefined
          ? {
              top_p: request.options.topP,
            }
          : {}),

        ...(request.options?.maxOutputTokens !== undefined
          ? {
              max_completion_tokens: request.options.maxOutputTokens,
            }
          : {}),

        ...(request.options?.stopSequences &&
        request.options.stopSequences.length > 0
          ? {
              stop: request.options.stopSequences,
            }
          : {}),

        stream: false,
      },

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const choice = response.choices?.[0];

    if (!choice) {
      throw new CloudError(
        "Cerebras returned no completion choice.",
        "INVALID_RESPONSE",
        {
          providerId: this.id,
          retryable: false,
        },
      );
    }

    const text = this.extractMessageText(choice.message?.content);

    return {
      type: "text_generation",

      providerId: this.id,

      model: model.modelId,

      text,

      /**
       * Cerebras may return null for finish_reason.
       *
       * Veyra's CloudTextResponse contract expects:
       *
       * string | undefined
       *
       * Therefore null is normalized to undefined.
       */
      finishReason: choice.finish_reason ?? undefined,

      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,

            outputTokens: response.usage.completion_tokens,

            totalTokens: response.usage.total_tokens,
          }
        : undefined,

      requestId: response.id,

      raw: response,
    };
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation") {
      throw new CloudError(
        `Cerebras streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          providerId: this.id,
          retryable: false,
        },
      );
    }

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
    );

    return this.createLazyStream(request, model.modelId, options);
  }

  // ==========================================================================
  // LAZY STREAM
  // ==========================================================================

  /**
   * CloudProvider.stream() is synchronous.
   *
   * The underlying HTTP request is asynchronous, so we create a lazy
   * CloudStream wrapper. The HTTP request is only started when the caller
   * begins consuming the async iterator.
   *
   * This mirrors the production streaming architecture used by the
   * working Groq provider.
   */
  private createLazyStream(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation";
      }
    >,
    modelId: string,
    options: CloudExecutionOptions,
  ): CloudStream {
    const startedAt = Date.now();

    const controller = new AbortController();

    const externalSignal = options.signal;

    const abortExternal = (): void => {
      if (!controller.signal.aborted) {
        controller.abort(externalSignal?.reason);
      }
    };

    if (externalSignal?.aborted) {
      abortExternal();
    } else {
      externalSignal?.addEventListener("abort", abortExternal, {
        once: true,
      });
    }

    let innerStream: CloudStream | undefined;

    let initialization: Promise<CloudStream> | undefined;

    const getStream = (): Promise<CloudStream> => {
      if (!initialization) {
        initialization = this.createStream(request, modelId, {
          ...options,

          signal: controller.signal,
        }).then((stream) => {
          innerStream = stream;

          return stream;
        });
      }

      return initialization;
    };

    return {
      providerId: this.id,

      startedAt,

      cancel: (): void => {
        if (!controller.signal.aborted) {
          controller.abort();
        }

        void innerStream?.cancel();
      },

      async *[Symbol.asyncIterator]() {
        try {
          const stream = await getStream();

          for await (const chunk of stream) {
            yield chunk;
          }
        } finally {
          externalSignal?.removeEventListener("abort", abortExternal);
        }
      },
    };
  }

  // ==========================================================================
  // CREATE STREAM
  // ==========================================================================

  private async createStream(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation";
      }
    >,
    modelId: string,
    options: CloudExecutionOptions,
  ): Promise<CloudStream> {
    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const requestBody: CerebrasChatRequest = {
      model: modelId,

      messages: this.toMessages(request.messages),

      temperature: request.options?.temperature,

      top_p: request.options?.topP,

      max_completion_tokens: request.options?.maxOutputTokens,

      stop: request.options?.stopSequences,

      stream: true,
    };

    const response = await this.http.raw({
      url: `${this.baseUrl()}/chat/completions`,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, this.config.headers),

        Accept: "text/event-stream",

        "Content-Type": "application/json",
      },

      body: JSON.stringify(requestBody),

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    return createStream(this.id, modelId, response, (payload, sequence) => {
      const data = payload as CerebrasStreamChunk;

      const choice = data.choices?.[0];

      const delta = this.extractMessageText(choice?.delta?.content);

      /**
       * Text content has priority over metadata.
       *
       * Some providers can return a final chunk that contains both
       * content and a finish reason. We should not discard that content.
       */
      if (delta) {
        return {
          type: "text_delta",

          data: {
            text: delta,
          },

          sequence,

          providerId: this.id,

          model: modelId,

          timestamp: Date.now(),
        };
      }

      /**
       * Normalize the provider's finish_reason:
       *
       * null -> undefined
       *
       * The presence of any non-null finish reason means the stream
       * has completed.
       */
      if (choice?.finish_reason != null) {
        return {
          type: "done",

          data,

          sequence,

          providerId: this.id,

          model: modelId,

          timestamp: Date.now(),
        };
      }

      return {
        type: "metadata",

        data,

        sequence,

        providerId: this.id,

        model: modelId,

        timestamp: Date.now(),
      };
    });
  }

  // ==========================================================================
  // HEALTH CHECK
  // ==========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<CloudHealth> {
    const startedAt = Date.now();

    try {
      const apiKey = await resolveCredential(
        this.config,
        this.credentialResolver,
      );

      const response = await this.http.raw({
        url: `${this.baseUrl()}/models`,

        method: "GET",

        headers: createAuthorizationHeaders(apiKey, this.config.headers),

        signal,

        timeoutMs: Math.min(this.config.timeoutMs, 10_000),
      });

      return {
        providerId: this.id,

        status: response.ok ? "healthy" : "degraded",

        checkedAt: Date.now(),

        latencyMs: Date.now() - startedAt,

        modelsAvailable: this.models.length,
      };
    } catch (error) {
      return {
        providerId: this.id,

        status: "unavailable",

        checkedAt: Date.now(),

        latencyMs: Date.now() - startedAt,

        error:
          error instanceof Error
            ? error.message
            : "Cerebras health check failed.",
      };
    }
  }

  // ==========================================================================
  // URL
  // ==========================================================================

  /**
   * defaultCloudProviders.ts configures:
   *
   * https://api.cerebras.ai/v1
   *
   * Therefore provider endpoints append only:
   *
   * /chat/completions
   * /models
   *
   * and never another /v1.
   */
  private baseUrl(): string {
    const configured = this.config.baseUrl.trim().replace(/\/+$/, "");

    if (!configured) {
      return "https://api.cerebras.ai/v1";
    }

    return configured;
  }

  // ==========================================================================
  // MESSAGE CONVERSION
  // ==========================================================================

  private toMessages(
    messages: readonly CloudMessage[],
  ): readonly Record<string, unknown>[] {
    return messages.map((message) => ({
      role: message.role,

      content: message.content,
    }));
  }

  // ==========================================================================
  // RESPONSE HELPERS
  // ==========================================================================

  private extractMessageText(content: string | null | undefined): string {
    if (typeof content !== "string") {
      return "";
    }

    return content;
  }
}

// ============================================================================
// REQUEST TYPES
// ============================================================================

interface CerebrasChatRequest {
  readonly model: string;

  readonly messages: readonly Record<string, unknown>[];

  readonly temperature?: number;

  readonly top_p?: number;

  readonly max_completion_tokens?: number;

  readonly stop?: readonly string[];

  readonly stream: boolean;
}

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

interface CerebrasResponse {
  readonly id?: string;

  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];

  readonly usage?: {
    readonly prompt_tokens?: number;

    readonly completion_tokens?: number;

    readonly total_tokens?: number;
  };
}

interface CerebrasStreamChunk {
  readonly id?: string;

  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];

  readonly usage?: {
    readonly prompt_tokens?: number;

    readonly completion_tokens?: number;

    readonly total_tokens?: number;
  };
}

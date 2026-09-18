// ============================================================================
// FILE: core/cloud/providers/Mistral/MistralProvider.ts
// PURPOSE:
// Production Mistral AI cloud provider adapter.
//
// SUPPORTED:
// - text generation
// - streaming
// - embeddings
// - tool calling
// - JSON structured output
//
// NOTE:
// The registry base URL is:
//   https://api.mistral.ai/v1
//
// Therefore endpoint paths in this provider MUST NOT add another /v1.
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";
import type { CloudProviderConfig } from "../../CloudProviderConfig";
import type { CloudCapabilities } from "../../CloudCapabilities";
import type { CloudModel } from "../../CloudModel";

import { MISTRAL_MODELS } from "./MistralModels";

import type {
  CloudRequest,
  CloudExecutionOptions,
  CloudMessage,
} from "../../contracts/CloudRequest";

import type {
  CloudResponse,
  CloudTextResponse,
  CloudEmbeddingResponse,
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

type MistralTextRequest = Extract<
  CloudRequest,
  {
    type: "text_generation";
  }
>;

type MistralEmbeddingRequest = Extract<
  CloudRequest,
  {
    type: "embedding";
  }
>;

export class MistralProvider implements CloudProvider {
  public readonly id = "mistral";

  public readonly name = "Mistral AI";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: false,
    speechToText: false,
    textToSpeech: false,
    embeddings: true,
    documentAnalysis: false,
    structuredOutput: true,
    toolCalling: true,
  });

  public readonly models: readonly CloudModel[] = MISTRAL_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "mistral") {
      throw new CloudError(
        `MistralProvider requires provider ID "mistral", received "${config.id}".`,
        "CONFIGURATION",
        {
          providerId: "mistral",
        },
      );
    }

    this.config = config;

    this.http = dependencies.http ?? new CloudHttpClient();

    if (!dependencies.credentialResolver) {
      throw new CloudError(
        "MistralProvider requires a credential resolver.",
        "CONFIGURATION",
        {
          providerId: this.id,
        },
      );
    }

    this.credentialResolver = dependencies.credentialResolver;
  }

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

  public async execute(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    switch (request.type) {
      case "text_generation":
        return this.generate(request, options);

      case "embedding":
        return this.embed(request, options);

      case "vision":
        throw new CloudError(
          "Mistral vision is not enabled by the current Veyra model catalogue.",
          "UNSUPPORTED",
          {
            retryable: false,
            providerId: this.id,
          },
        );

      default:
        throw new CloudError(
          `Mistral does not support "${request.type}".`,
          "UNSUPPORTED",
          {
            retryable: false,
            providerId: this.id,
          },
        );
    }
  }

  // ==========================================================================
  // TEXT GENERATION
  // ==========================================================================

  private async generate(
    request: MistralTextRequest,
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

    const response = await this.http.json<MistralChatResponse>({
      url: `${this.baseUrl()}/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: this.createChatBody(request, model.modelId, false),

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const choice = response.choices?.[0];

    if (!choice) {
      throw new CloudError(
        "Mistral returned no completion choice.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    return {
      type: "text_generation",

      providerId: this.id,

      model: model.modelId,

      text: this.extractText(choice.message?.content),

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
  // EMBEDDINGS
  // ==========================================================================

  private async embed(
    request: MistralEmbeddingRequest,
    options: CloudExecutionOptions,
  ): Promise<CloudEmbeddingResponse> {
    assertCapability(this.capabilities, "embeddings", this.id);

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.embedding ?? "mistral-embed",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const inputs =
      typeof request.input === "string"
        ? [request.input]
        : Array.from(request.input);

    const response = await this.http.json<MistralEmbeddingResponse>({
      url: `${this.baseUrl()}/embeddings`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: {
        model: model.modelId,
        input: inputs,
      },

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const orderedData = Array.from(response.data ?? []).sort(
      (a: MistralEmbeddingItem, b: MistralEmbeddingItem) => a.index - b.index,
    );

    if (orderedData.length !== inputs.length) {
      throw new CloudError(
        `Mistral returned ${orderedData.length} embeddings for ${inputs.length} inputs.`,
        "INVALID_RESPONSE",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    const embeddings = orderedData.map((item: MistralEmbeddingItem) =>
      Array.from(item.embedding),
    );

    const dimensions = embeddings[0]?.length ?? 0;

    if (embeddings.some((embedding) => embedding.length !== dimensions)) {
      throw new CloudError(
        "Mistral returned embeddings with inconsistent dimensions.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    return {
      type: "embedding",

      providerId: this.id,

      model: model.modelId,

      embeddings,

      dimensions,

      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,

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
        `Mistral streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    assertCapability(this.capabilities, "streaming", this.id);

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
    );

    const requestBody = this.createChatBody(request, model.modelId, true);

    return createStream(
      this.id,
      model.modelId,
      async (signal) => {
        const apiKey = await resolveCredential(
          this.config,
          this.credentialResolver,
        );

        return this.http.raw({
          url: `${this.baseUrl()}/chat/completions`,

          method: "POST",

          headers: {
            ...createAuthorizationHeaders(apiKey, this.config.headers),

            Accept: "text/event-stream",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(requestBody),

          signal,

          timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
        });
      },
      (payload, sequence) => {
        const data = payload as MistralStreamChunk;

        const choice = data.choices?.[0];

        const delta = this.extractText(choice?.delta?.content);

        if (delta) {
          return {
            type: "text_delta",

            data: {
              text: delta,
            },

            sequence,

            providerId: this.id,

            model: model.modelId,

            timestamp: Date.now(),
          };
        }

        return {
          type: choice?.finish_reason === "stop" ? "done" : "metadata",

          data,

          sequence,

          providerId: this.id,

          model: model.modelId,

          timestamp: Date.now(),
        };
      },
      options.signal,
    );
  }

  // ==========================================================================
  // HEALTH
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
            : "Mistral health check failed.",
      };
    }
  }

  // ==========================================================================
  // REQUEST BUILDING
  // ==========================================================================

  private createChatBody(
    request: MistralTextRequest,
    modelId: string,
    stream: boolean,
  ): Record<string, unknown> {
    const options = request.options;

    const body: Record<string, unknown> = {
      model: modelId,

      messages: this.toMessages(request.messages),

      stream,

      ...(options?.temperature !== undefined
        ? {
            temperature: options.temperature,
          }
        : {}),

      ...(options?.topP !== undefined
        ? {
            top_p: options.topP,
          }
        : {}),

      ...(options?.maxOutputTokens !== undefined
        ? {
            max_tokens: options.maxOutputTokens,
          }
        : {}),

      ...(options?.stopSequences?.length
        ? {
            stop: options.stopSequences,
          }
        : {}),
    };

    if (options?.tools?.length) {
      body.tools = options.tools.map((tool) => ({
        type: "function",

        function: {
          name: tool.name,

          description: tool.description,

          parameters: tool.parameters,
        },
      }));
    }

    if (options?.responseFormat === "json") {
      body.response_format = {
        type: "json_object",
      };
    }

    return body;
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
  // CONTENT EXTRACTION
  // ==========================================================================

  private extractText(
    content: string | readonly unknown[] | null | undefined,
  ): string {
    if (typeof content === "string") {
      return content;
    }

    if (!content) {
      return "";
    }

    return content
      .map((part) => {
        if (typeof part === "object" && part !== null && "text" in part) {
          const text = (
            part as {
              text?: unknown;
            }
          ).text;

          return typeof text === "string" ? text : "";
        }

        return "";
      })
      .join("");
  }

  // ==========================================================================
  // BASE URL
  // ==========================================================================

  private baseUrl(): string {
    return (
      this.config.baseUrl.replace(/\/+$/, "") || "https://api.mistral.ai/v1"
    );
  }
}

// ============================================================================
// WIRE TYPES
// ============================================================================

interface MistralChatResponse {
  readonly id?: string;

  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly unknown[] | null;
    };

    readonly finish_reason?: string | null;
  }[];

  readonly usage?: {
    readonly prompt_tokens?: number;

    readonly completion_tokens?: number;

    readonly total_tokens?: number;
  };
}

interface MistralStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | readonly unknown[] | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

interface MistralEmbeddingResponse {
  readonly id?: string;

  readonly data?: readonly MistralEmbeddingItem[];

  readonly usage?: {
    readonly prompt_tokens?: number;

    readonly total_tokens?: number;
  };
}

interface MistralEmbeddingItem {
  readonly index: number;

  readonly embedding: readonly number[];
}

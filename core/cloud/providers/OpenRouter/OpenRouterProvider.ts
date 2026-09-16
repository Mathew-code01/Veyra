// ============================================================================
// FILE: core/cloud/providers/OpenRouter/OpenRouterProvider.ts
// PURPOSE:
// OpenRouter aggregation provider.
//
// SUPPORTED:
// - text generation
// - streaming
// - vision when selected model supports it
// - structured output/tool metadata
//
// OpenRouter model IDs are dynamic. The static model catalogue therefore
// contains only stable defaults; dynamic discovery can be added later.
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";

import type { CloudProviderConfig } from "../../CloudProviderConfig";

import type { CloudCapabilities } from "../../CloudCapabilities";

import type { CloudModel } from "../../CloudModel";

import { OPENROUTER_MODELS } from "./OpenRouterModels";

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
  createAuthorizationHeaders,
  createStream,
  type CloudProviderDependencies,
} from "../../CloudProviderSupport";

export class OpenRouterProvider implements CloudProvider {
  public readonly id = "openrouter";

  public readonly name = "OpenRouter";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: true,
    speechToText: false,
    textToSpeech: false,
    embeddings: false,
    documentAnalysis: false,
    structuredOutput: true,
    toolCalling: true,
  });

  public readonly models: readonly CloudModel[] = OPENROUTER_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "openrouter") {
      throw new CloudError(
        `OpenRouterProvider requires provider ID "openrouter", received "${config.id}".`,
        "CONFIGURATION",
        {
          providerId: "openrouter",
        },
      );
    }

    this.config = config;

    this.http = dependencies.http ?? new CloudHttpClient();

    if (!dependencies.credentialResolver) {
      throw new CloudError(
        "OpenRouterProvider requires a credential resolver.",
        "CONFIGURATION",
        {
          providerId: this.id,
        },
      );
    }

    this.credentialResolver = dependencies.credentialResolver;
  }

  public async execute(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    switch (request.type) {
      case "text_generation":
      case "vision":
        return this.generate(request, options);

      default:
        throw new CloudError(
          `OpenRouter does not support "${request.type}" through the current adapter.`,
          "UNSUPPORTED",
          {
            providerId: this.id,
          },
        );
    }
  }

  private async generate(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation" | "vision";
      }
    >,
    options: CloudExecutionOptions,
  ): Promise<CloudTextResponse> {
    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation ?? "openrouter/auto",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.json<OpenRouterResponse>({
      url: `${this.baseUrl()}/api/v1/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, {
        ...this.config.headers,

        "HTTP-Referer": "https://mthw-dev.vercel.app",

        "X-Title": "Veyra",
      }),

      body: {
        model: model.modelId,

        messages: this.toMessages(request.messages),

        temperature: request.options?.temperature,

        top_p: request.options?.topP,

        max_tokens: request.options?.maxOutputTokens,

        stop: request.options?.stopSequences,

        stream: false,
      },

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const choice = response.choices?.[0];

    if (!choice) {
      throw new CloudError(
        "OpenRouter returned no completion choice.",
        "INVALID_RESPONSE",
        {
          providerId: this.id,
        },
      );
    }

    return {
      type: request.type === "vision" ? "vision" : "text_generation",

      providerId: this.id,

      model: model.modelId,

      text: this.extractText(choice.message?.content),

      finishReason: choice.finish_reason,

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

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation" && request.type !== "vision") {
      throw new CloudError(
        `OpenRouter streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          providerId: this.id,
        },
      );
    }

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation ?? "openrouter/auto",
    );

    return this.createStream(
      request,
      model.modelId,
      options,
    ) as unknown as CloudStream;
  }

  private async createStream(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation" | "vision";
      }
    >,
    modelId: string,
    options: CloudExecutionOptions,
  ): Promise<CloudStream> {
    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.raw({
      url: `${this.baseUrl()}/api/v1/chat/completions`,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, {
          ...this.config.headers,

          "HTTP-Referer": "https://mthw-dev.vercel.app",

          "X-Title": "Veyra",
        }),

        Accept: "text/event-stream",

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: modelId,

        messages: this.toMessages(request.messages),

        temperature: request.options?.temperature,

        top_p: request.options?.topP,

        max_tokens: request.options?.maxOutputTokens,

        stop: request.options?.stopSequences,

        stream: true,
      }),

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    return createStream(this.id, modelId, response, (payload, sequence) => {
      const data = payload as OpenRouterStreamChunk;

      const delta = data.choices?.[0]?.delta?.content;

      if (!delta) {
        return {
          type:
            data.choices?.[0]?.finish_reason === "stop" ? "done" : "metadata",

          data,

          sequence,

          providerId: this.id,

          model: modelId,

          timestamp: Date.now(),
        };
      }

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
    });
  }

  public async healthCheck(signal?: AbortSignal): Promise<CloudHealth> {
    const startedAt = Date.now();

    try {
      const apiKey = await resolveCredential(
        this.config,
        this.credentialResolver,
      );

      const response = await this.http.raw({
        url: `${this.baseUrl()}/api/v1/models`,

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
            : "OpenRouter health check failed.",
      };
    }
  }

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "") || "https://openrouter.ai";
  }

  private toMessages(
    messages: readonly CloudMessage[],
  ): readonly Record<string, unknown>[] {
    return messages.map((message) => ({
      role: message.role,

      content: message.content,
    }));
  }

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
}

interface OpenRouterResponse {
  readonly id?: string;

  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | readonly unknown[] | null;
    };

    readonly finish_reason?: string;
  }[];

  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface OpenRouterStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

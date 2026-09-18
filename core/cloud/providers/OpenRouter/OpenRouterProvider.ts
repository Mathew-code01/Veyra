// ============================================================================
// FILE: core/cloud/providers/OpenRouter/OpenRouterProvider.ts
// PURPOSE:
// Production OpenRouter aggregation provider.
//
// SUPPORTED:
// - text generation
// - streaming
// - vision when selected model supports it
// - structured output metadata
// - tool calling metadata
//
// OpenRouter uses:
//   https://openrouter.ai/api/v1
//
// The registry already contains /api/v1, therefore provider endpoint paths
// must not duplicate it.
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
  assertCapability,
  createAuthorizationHeaders,
  createStream,
  type CloudProviderDependencies,
} from "../../CloudProviderSupport";

type OpenRouterGenerationRequest = Extract<
  CloudRequest,
  {
    type: "text_generation" | "vision";
  }
>;

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
          providerId: this.id,
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

  // ==========================================================================
  // EXECUTE
  // ==========================================================================

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
            retryable: false,
            providerId: this.id,
          },
        );
    }
  }

  // ==========================================================================
  // GENERATION
  // ==========================================================================

  private async generate(
    request: OpenRouterGenerationRequest,
    options: CloudExecutionOptions,
  ): Promise<CloudTextResponse> {
    if (request.type === "vision") {
      assertCapability(this.capabilities, "vision", this.id);
    } else {
      assertCapability(this.capabilities, "textGeneration", this.id);
    }

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation ?? "openai/gpt-oss-120b",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.json<OpenRouterResponse>({
      url: `${this.baseUrl()}/chat/completions`,

      method: "POST",

      headers: this.createHeaders(apiKey),

      body: this.createRequestBody(request, model.modelId, false),

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const choice = response.choices?.[0];

    if (!choice) {
      throw new CloudError(
        "OpenRouter returned no completion choice.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    return {
      type: request.type === "vision" ? "vision" : "text_generation",

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
  // STREAMING
  // ==========================================================================

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation" && request.type !== "vision") {
      throw new CloudError(
        `OpenRouter streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    if (request.type === "vision") {
      assertCapability(this.capabilities, "vision", this.id);
    } else {
      assertCapability(this.capabilities, "textGeneration", this.id);
    }

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation ?? "openai/gpt-oss-120b",
    );

    const requestBody = this.createRequestBody(request, model.modelId, true);

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
            ...this.createHeaders(apiKey),

            Accept: "text/event-stream",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(requestBody),

          signal,

          timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
        });
      },
      (payload, sequence) => {
        const data = payload as OpenRouterStreamChunk;

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
            : "OpenRouter health check failed.",
      };
    }
  }

  // ==========================================================================
  // HEADERS
  // ==========================================================================

  private createHeaders(apiKey: string): Record<string, string> {
    const metadata = this.config.metadata ?? {};

    const applicationUrl =
      typeof metadata.applicationUrl === "string"
        ? metadata.applicationUrl
        : undefined;

    const applicationName =
      typeof metadata.applicationName === "string"
        ? metadata.applicationName
        : "Veyra";

    return createAuthorizationHeaders(apiKey, {
      ...this.config.headers,

      ...(applicationUrl
        ? {
            "HTTP-Referer": applicationUrl,
          }
        : {}),

      "X-Title": applicationName,
    });
  }

  // ==========================================================================
  // REQUEST BODY
  // ==========================================================================

  private createRequestBody(
    request: OpenRouterGenerationRequest,
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
  // MESSAGES
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
  // CONTENT
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
      this.config.baseUrl.replace(/\/+$/, "") || "https://openrouter.ai/api/v1"
    );
  }
}

// ============================================================================
// WIRE TYPES
// ============================================================================

interface OpenRouterResponse {
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

interface OpenRouterStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

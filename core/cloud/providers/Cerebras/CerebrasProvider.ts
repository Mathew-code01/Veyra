// ============================================================================
// FILE: core/cloud/providers/Cerebras/CerebrasProvider.ts
// PURPOSE:
// Cerebras cloud provider adapter.
//
// CURRENT ROLE IN VEYRA:
// - text generation
// - streaming
// - structured output/tool metadata where supported by model
//
// Deliberately does not claim STT/TTS/vision support.
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

  public async execute(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    if (request.type !== "text_generation" && request.type !== "vision") {
      throw new CloudError(
        `Cerebras does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          providerId: this.id,
        },
      );
    }

    if (request.type === "vision") {
      throw new CloudError(
        "Cerebras is not configured for vision in Veyra.",
        "UNSUPPORTED",
        {
          providerId: this.id,
        },
      );
    }

    return this.generate(request, options);
  }

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
      url: `${this.baseUrl()}/v1/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

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
        "Cerebras returned no completion choice.",
        "INVALID_RESPONSE",
        {
          providerId: this.id,
        },
      );
    }

    return {
      type: "text_generation",

      providerId: this.id,

      model: model.modelId,

      text: choice.message?.content ?? "",

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
    if (request.type !== "text_generation") {
      throw new CloudError(
        `Cerebras streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          providerId: this.id,
        },
      );
    }

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
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

    const response = await this.http.raw({
      url: `${this.baseUrl()}/v1/chat/completions`,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, this.config.headers),

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
      const data = payload as CerebrasStreamChunk;

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
        url: `${this.baseUrl()}/v1/models`,

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

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "") || "https://api.cerebras.ai";
  }

  private toMessages(
    messages: readonly CloudMessage[],
  ): readonly Record<string, unknown>[] {
    return messages.map((message) => ({
      role: message.role,

      content: message.content,
    }));
  }
}

interface CerebrasResponse {
  readonly id?: string;

  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string;
  }[];

  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface CerebrasStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

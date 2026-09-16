// ============================================================================
// FILE: core/cloud/providers/Gemini/GeminiProvider.ts
// PURPOSE:
// Google Gemini cloud provider adapter.
//
// SUPPORTED:
// - text generation
// - streaming
// - vision
// - document analysis through multimodal generation
// - structured output
// - tool calling
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";

import type { CloudProviderConfig } from "../../CloudProviderConfig";

import type { CloudCapabilities } from "../../CloudCapabilities";

import type { CloudModel } from "../../CloudModel";

import { GEMINI_MODELS } from "./GeminiModels";

import type {
  CloudRequest,
  CloudExecutionOptions,
  CloudMessage,
  CloudContentPart,
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
  createApiKeyHeaders,
  createStream,
  type CloudProviderDependencies,
} from "../../CloudProviderSupport";

type GeminiGeneratableRequest = Extract<
  CloudRequest,
  {
    type: "text_generation" | "vision";
  }
>;

type GeminiGenerationOptions = GeminiGeneratableRequest["options"];

export class GeminiProvider implements CloudProvider {
  public readonly id = "gemini";

  public readonly name = "Google Gemini";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: true,
    speechToText: false,
    textToSpeech: false,
    embeddings: false,
    documentAnalysis: true,
    structuredOutput: true,
    toolCalling: true,
  });

  public readonly models: readonly CloudModel[] = GEMINI_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "gemini") {
      throw new CloudError(
        `GeminiProvider requires provider ID "gemini", received "${config.id}".`,
        "CONFIGURATION",
        {
          providerId: "gemini",
        },
      );
    }

    this.config = config;

    this.http = dependencies.http ?? new CloudHttpClient();

    if (!dependencies.credentialResolver) {
      throw new CloudError(
        "GeminiProvider requires a credential resolver.",
        "CONFIGURATION",
        {
          providerId: this.id,
        },
      );
    }

    this.credentialResolver = dependencies.credentialResolver;
  }

  // ========================================================================
  // EXECUTE
  // ========================================================================

  public async execute(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): Promise<CloudResponse> {
    switch (request.type) {
      case "text_generation":
      case "vision":
        return this.generateContent(request, options);

      case "document_analysis":
        return this.generateContent(
          {
            type: "vision",

            model: request.model,

            messages: [
              {
                role: "user",

                content:
                  request.prompt ??
                  "Analyze this document and return the relevant information.",
              },
            ],
          },
          options,
        );

      default:
        throw new CloudError(
          `Gemini provider does not support request type "${request.type}".`,
          "UNSUPPORTED",
          {
            retryable: false,
            providerId: this.id,
          },
        );
    }
  }

  // ========================================================================
  // GENERATE
  // ========================================================================

  private async generateContent(
    request: GeminiGeneratableRequest,
    options: CloudExecutionOptions,
  ): Promise<CloudTextResponse> {
    assertCapability(
      this.capabilities,
      request.type === "vision" ? "vision" : "textGeneration",
      this.id,
    );

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const body = this.createGenerateBody(request);

    const url =
      `${this.baseUrl()}/v1beta/models/` +
      `${encodeURIComponent(model.modelId)}` +
      `:generateContent`;

    const response = await this.http.json<GeminiGenerateResponse>({
      url,

      method: "POST",

      headers: createApiKeyHeaders(apiKey, this.config.headers),

      body,

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const text = this.extractText(response);

    return {
      type: request.type === "vision" ? "vision" : "text_generation",

      providerId: this.id,

      model: model.modelId,

      text,

      finishReason: response.candidates?.[0]?.finishReason,

      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount,

            outputTokens: response.usageMetadata.candidatesTokenCount,

            totalTokens: response.usageMetadata.totalTokenCount,
          }
        : undefined,

      raw: response,
    };
  }

  // ========================================================================
  // STREAMING
  // ========================================================================

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation" && request.type !== "vision") {
      throw new CloudError(
        `Gemini streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          retryable: false,
          providerId: this.id,
        },
      );
    }

    assertCapability(this.capabilities, "streaming", this.id);

    assertCapability(
      this.capabilities,
      request.type === "vision" ? "vision" : "textGeneration",
      this.id,
    );

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_generation,
    );

    const body = this.createGenerateBody(request);

    return createStream(
      this.id,
      model.modelId,
      async (signal) => {
        const apiKey = await resolveCredential(
          this.config,
          this.credentialResolver,
        );

        const url =
          `${this.baseUrl()}/v1beta/models/` +
          `${encodeURIComponent(model.modelId)}` +
          `:streamGenerateContent?alt=sse`;

        return this.http.raw({
          url,

          method: "POST",

          headers: {
            ...createApiKeyHeaders(apiKey, this.config.headers),

            Accept: "text/event-stream",

            "Content-Type": "application/json",
          },

          body: JSON.stringify(body),

          signal,

          timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
        });
      },
      (payload, sequence) => {
        const data = payload as GeminiGenerateResponse;

        const text = this.extractText(data);

        if (text) {
          return {
            type: "text_delta",

            data: {
              text,
            },

            sequence,

            providerId: this.id,

            model: model.modelId,

            timestamp: Date.now(),
          };
        }

        return {
          type: "metadata",

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

  // ========================================================================
  // HEALTH
  // ========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<CloudHealth> {
    const startedAt = Date.now();

    try {
      const apiKey = await resolveCredential(
        this.config,
        this.credentialResolver,
      );

      const response = await this.http.raw({
        url: `${this.baseUrl()}/v1beta/models`,

        method: "GET",

        headers: createApiKeyHeaders(apiKey, this.config.headers),

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
            : "Gemini health check failed.",
      };
    }
  }

  // ========================================================================
  // REQUEST BODY
  // ========================================================================

  private createGenerateBody(
    request: GeminiGeneratableRequest,
  ): Record<string, unknown> {
    const systemMessages = request.messages.filter(
      (message) => message.role === "system",
    );

    const conversationMessages = request.messages.filter(
      (message) => message.role !== "system",
    );

    const body: Record<string, unknown> = {
      contents: this.toGeminiContents(conversationMessages),

      generationConfig: this.toGenerationConfig(request.options),
    };

    if (systemMessages.length) {
      body.systemInstruction = {
        parts: systemMessages.flatMap((message) =>
          this.toGeminiParts(message.content),
        ),
      };
    }

    if (request.options?.tools?.length) {
      body.tools = [
        {
          functionDeclarations: request.options.tools.map((tool) => ({
            name: tool.name,

            description: tool.description,

            parameters: tool.parameters,
          })),
        },
      ];
    }

    return body;
  }

  // ========================================================================
  // GEMINI CONTENTS
  // ========================================================================

  private toGeminiContents(
    messages: readonly CloudMessage[],
  ): readonly GeminiContent[] {
    return messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",

      parts: this.toGeminiParts(message.content),
    }));
  }

  private toGeminiParts(
    content: string | readonly CloudContentPart[],
  ): readonly GeminiPart[] {
    if (typeof content === "string") {
      return [
        {
          text: content,
        },
      ];
    }

    return content.map((part) => {
      if (part.type === "text") {
        return {
          text: part.text,
        };
      }

      if (part.source.type === "url") {
        return {
          fileData: {
            fileUri: part.source.url,
          },
        };
      }

      return {
        inlineData: {
          mimeType: part.source.mediaType,

          data: part.source.data,
        },
      };
    });
  }

  // ========================================================================
  // GENERATION OPTIONS
  // ========================================================================

  private toGenerationConfig(
    options: GeminiGenerationOptions | undefined,
  ): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    if (options?.temperature !== undefined) {
      config.temperature = options.temperature;
    }

    if (options?.topP !== undefined) {
      config.topP = options.topP;
    }

    if (options?.maxOutputTokens !== undefined) {
      config.maxOutputTokens = options.maxOutputTokens;
    }

    if (options?.stopSequences?.length) {
      config.stopSequences = options.stopSequences;
    }

    if (options?.responseFormat === "json") {
      config.responseMimeType = "application/json";
    }

    return config;
  }

  // ========================================================================
  // RESPONSE TEXT
  // ========================================================================

  private extractText(response: GeminiGenerateResponse): string {
    return (
      response.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("") ?? ""
    );
  }

  // ========================================================================
  // BASE URL
  // ========================================================================

  private baseUrl(): string {
    return (
      this.config.baseUrl.replace(/\/+$/, "") ||
      "https://generativelanguage.googleapis.com"
    );
  }
}

// ============================================================================
// WIRE TYPES
// ============================================================================

interface GeminiGenerateResponse {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly GeminiPart[];
    };

    readonly finishReason?: string;
  }[];

  readonly usageMetadata?: {
    readonly promptTokenCount?: number;

    readonly candidatesTokenCount?: number;

    readonly totalTokenCount?: number;
  };
}

interface GeminiContent {
  readonly role: "user" | "model";

  readonly parts: readonly GeminiPart[];
}

interface GeminiPart {
  readonly text?: string;

  readonly inlineData?: {
    readonly mimeType: string;

    readonly data: string;
  };

  readonly fileData?: {
    readonly fileUri: string;
  };
}

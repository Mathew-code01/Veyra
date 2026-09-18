// ============================================================================
// FILE: core/cloud/providers/HuggingFace/HuggingFaceProvider.ts
// PURPOSE:
// Production Hugging Face Inference Providers adapter.
//
// SUPPORTED:
// - chat/text generation
// - streaming chat
// - speech-to-text
//
// Hugging Face chat uses the current OpenAI-compatible router:
//   https://router.huggingface.co/v1
//
// IMPORTANT:
// The provider config already contains /v1, so endpoint paths must not
// append another /v1.
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";
import type { CloudProviderConfig } from "../../CloudProviderConfig";
import type { CloudCapabilities } from "../../CloudCapabilities";
import type { CloudModel } from "../../CloudModel";

import { HUGGINGFACE_MODELS } from "./HuggingFaceModels";

import type {
  CloudRequest,
  CloudExecutionOptions,
  CloudMessage,
} from "../../contracts/CloudRequest";

import type {
  CloudResponse,
  CloudTextResponse,
  CloudSpeechToTextResponse,
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

type HuggingFaceTextRequest = Extract<
  CloudRequest,
  {
    type: "text_generation";
  }
>;

export class HuggingFaceProvider implements CloudProvider {
  public readonly id = "huggingface";

  public readonly name = "Hugging Face";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: false,
    speechToText: true,
    textToSpeech: false,
    embeddings: false,
    documentAnalysis: false,
    structuredOutput: false,
    toolCalling: false,
  });

  public readonly models: readonly CloudModel[] = HUGGINGFACE_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "huggingface") {
      throw new CloudError(
        `HuggingFaceProvider requires provider ID "huggingface", received "${config.id}".`,
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
        "HuggingFaceProvider requires a credential resolver.",
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

      case "vision":
        throw new CloudError(
          "Hugging Face vision is not enabled by the current Veyra model catalogue.",
          "UNSUPPORTED",
          {
            retryable: false,
            providerId: this.id,
          },
        );

      case "speech_to_text":
        return this.transcribe(request, options);

      default:
        throw new CloudError(
          `Hugging Face does not support "${request.type}" through this adapter.`,
          "UNSUPPORTED",
          {
            retryable: false,
            providerId: this.id,
          },
        );
    }
  }

  // ==========================================================================
  // CHAT
  // ==========================================================================

  private async generate(
    request: HuggingFaceTextRequest,
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

    const response = await this.http.json<HuggingFaceChatResponse>({
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
        "Hugging Face returned no completion choice.",
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
  // STREAMING
  // ==========================================================================

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation") {
      throw new CloudError(
        `Hugging Face streaming does not support "${request.type}".`,
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

    const body = this.createChatBody(request, model.modelId, true);

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

          body: JSON.stringify(body),

          signal,

          timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
        });
      },
      (payload, sequence) => {
        const data = payload as HuggingFaceStreamChunk;

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
  // SPEECH TO TEXT
  // ==========================================================================

  private async transcribe(
    request: Extract<
      CloudRequest,
      {
        type: "speech_to_text";
      }
    >,
    options: CloudExecutionOptions,
  ): Promise<CloudSpeechToTextResponse> {
    assertCapability(this.capabilities, "speechToText", this.id);

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.speech_to_text ?? "openai/whisper-large-v3",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    /**
     * Hugging Face task endpoints are separate from the
     * OpenAI-compatible chat router.
     *
     * The configured base URL is the router host, therefore
     * the task endpoint is built explicitly here.
     */
    const url =
      `https://router.huggingface.co/` +
      `hf-inference/models/` +
      `${this.encodeModelPath(model.modelId)}`;

    const audioBytes = request.audio.slice();

    const audioBody = new Blob(
      [
        audioBytes.buffer.slice(
          audioBytes.byteOffset,
          audioBytes.byteOffset + audioBytes.byteLength,
        ) as ArrayBuffer,
      ],
      {
        type: request.mimeType,
      },
    );

    const response = await this.http.raw({
      url,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, this.config.headers),

        "Content-Type": request.mimeType,

        Accept: "application/json",
      },

      body: audioBody,

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const contentType = response.headers.get("content-type") ?? "";

    let data: unknown;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      throw new CloudError(
        `Hugging Face speech-to-text request failed with HTTP ${response.status}.`,
        "INVALID_RESPONSE",
        {
          retryable: response.status === 429 || response.status >= 500,

          providerId: this.id,

          details: {
            status: response.status,

            response: data,
          },
        },
      );
    }

    return {
      type: "speech_to_text",

      providerId: this.id,

      model: model.modelId,

      text: this.extractTranscription(data),

      raw: data,
    };
  }

  // ==========================================================================
  // REQUEST BODY
  // ==========================================================================

  private createChatBody(
    request: HuggingFaceTextRequest,
    modelId: string,
    stream: boolean,
  ): Record<string, unknown> {
    const options = request.options;

    return {
      model: modelId,

      messages: this.toMessages(request.messages),

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

      stream,
    };
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
  // TEXT EXTRACTION
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
  // TRANSCRIPTION EXTRACTION
  // ==========================================================================

  private extractTranscription(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }

    if (!data || typeof data !== "object") {
      return "";
    }

    const object = data as Record<string, unknown>;

    if (typeof object.text === "string") {
      return object.text;
    }

    return "";
  }

  // ==========================================================================
  // MODEL PATH
  // ==========================================================================

  private encodeModelPath(modelId: string): string {
    return modelId
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }

  // ==========================================================================
  // BASE URL
  // ==========================================================================

  private baseUrl(): string {
    return (
      this.config.baseUrl.replace(/\/+$/, "") ||
      "https://router.huggingface.co/v1"
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
            : "Hugging Face health check failed.",
      };
    }
  }
}

// ============================================================================
// WIRE TYPES
// ============================================================================

interface HuggingFaceChatResponse {
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

interface HuggingFaceStreamChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

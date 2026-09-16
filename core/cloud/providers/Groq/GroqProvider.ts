// ============================================================================
// FILE: core/cloud/providers/Groq/GroqProvider.ts
// PURPOSE:
// Groq cloud provider adapter.
//
// SUPPORTED:
// - text generation
// - streaming
// - speech-to-text
// - text-to-speech
//
// AUTH:
// CloudCredentialResolver only.
// ============================================================================

import type { CloudProvider } from "../../CloudProvider";

import type { CloudProviderConfig } from "../../CloudProviderConfig";

import type { CloudCapabilities } from "../../CloudCapabilities";

import type { CloudModel } from "../../CloudModel";

import { GROQ_MODELS } from "./GroqModels";

import type {
  CloudRequest,
  CloudExecutionOptions,
  CloudMessage,
} from "../../contracts/CloudRequest";

import type {
  CloudResponse,
  CloudTextResponse,
  CloudSpeechToTextResponse,
  CloudTextToSpeechResponse,
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

export class GroqProvider implements CloudProvider {
  public readonly id = "groq";

  public readonly name = "Groq";

  public readonly config: CloudProviderConfig;

  public readonly capabilities: CloudCapabilities = Object.freeze({
    textGeneration: true,
    streaming: true,
    vision: false,
    speechToText: true,
    textToSpeech: true,
    embeddings: false,
    documentAnalysis: false,
    structuredOutput: true,
    toolCalling: true,
  });

  public readonly models: readonly CloudModel[] = GROQ_MODELS;

  private readonly http: CloudHttpClient;

  private readonly credentialResolver: NonNullable<
    CloudProviderDependencies["credentialResolver"]
  >;

  public constructor(
    config: CloudProviderConfig,
    dependencies: CloudProviderDependencies,
  ) {
    if (config.id !== "groq") {
      throw new CloudError(
        `GroqProvider requires provider ID "groq", received "${config.id}".`,
        "CONFIGURATION",
        {
          providerId: "groq",
        },
      );
    }

    this.config = config;

    this.http = dependencies.http ?? new CloudHttpClient();

    if (!dependencies.credentialResolver) {
      throw new CloudError(
        "GroqProvider requires a credential resolver.",
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
        return this.generateText(request, options);

      case "speech_to_text":
        return this.transcribe(request, options);

      case "text_to_speech":
        return this.synthesize(request, options);

      default:
        throw new CloudError(
          `Groq does not support "${request.type}".`,
          "UNSUPPORTED",
          {
            providerId: this.id,
          },
        );
    }
  }

  // ========================================================================
  // Text
  // ========================================================================

  private async generateText(
    request: Extract<
      CloudRequest,
      {
        type: "text_generation" | "vision";
      }
    >,
    options: CloudExecutionOptions,
  ): Promise<CloudTextResponse> {
    assertCapability(this.capabilities, "textGeneration", this.id);

    if (request.type === "vision") {
      throw new CloudError(
        "GroqProvider is not configured for vision in the current Veyra model catalogue.",
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

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.json<GroqChatResponse>({
      url: `${this.baseUrl()}/openai/v1/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: {
        model: model.modelId,

        messages: this.toGroqMessages(request.messages),

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
        "Groq returned no completion choices.",
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

      text: this.extractMessageText(choice.message?.content),

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

  // ========================================================================
  // Streaming
  // ========================================================================

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  public stream(
    request: CloudRequest,
    options: CloudExecutionOptions = {},
  ): CloudStream {
    if (request.type !== "text_generation") {
      throw new CloudError(
        `Groq streaming does not support "${request.type}".`,
        "UNSUPPORTED",
        {
          retryable: false,
          providerId: this.id,
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

    const abortExternal = () => {
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

      cancel: () => {
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
      url: `${this.baseUrl()}/openai/v1/chat/completions`,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, this.config.headers),

        Accept: "text/event-stream",

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: modelId,

        messages: this.toGroqMessages(request.messages),

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
      const data = payload as GroqChatChunk;

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

  // ========================================================================
  // Speech-to-text
  // ========================================================================

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
      this.config.defaultModels?.speech_to_text ?? "whisper-large-v3-turbo",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const form = new FormData();

    const audioBuffer = new ArrayBuffer(request.audio.byteLength);

    new Uint8Array(audioBuffer).set(request.audio);

    const blob = new Blob([audioBuffer], {
      type: request.mimeType,
    });

    form.append("file", blob, request.filename ?? "audio.wav");

    form.append("model", model.modelId);

    if (request.language) {
      form.append("language", request.language);
    }

    if (request.prompt) {
      form.append("prompt", request.prompt);
    }

    form.append(
      "response_format",
      request.timestamps ? "verbose_json" : "json",
    );

    if (request.timestamps) {
      form.append("timestamp_granularities[]", "segment");
    }

    const response = await this.http.json<GroqTranscriptionResponse>({
      url: `${this.baseUrl()}/openai/v1/audio/transcriptions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: form,

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    return {
      type: "speech_to_text",

      providerId: this.id,

      model: model.modelId,

      text: response.text ?? "",

      language: response.language,

      durationSeconds: response.duration,

      segments: response.segments?.map((segment) => ({
        startSeconds: segment.start,

        endSeconds: segment.end,

        text: segment.text,
      })),

      raw: response,
    };
  }

  // ========================================================================
  // Text-to-speech
  // ========================================================================

  private async synthesize(
    request: Extract<
      CloudRequest,
      {
        type: "text_to_speech";
      }
    >,
    options: CloudExecutionOptions,
  ): Promise<CloudTextToSpeechResponse> {
    assertCapability(this.capabilities, "textToSpeech", this.id);

    const model = resolveModel(
      this.models,
      request.model,
      this.config.defaultModels?.text_to_speech ??
        "canopylabs/orpheus-v1-english",
    );

    const apiKey = await resolveCredential(
      this.config,
      this.credentialResolver,
    );

    const response = await this.http.raw({
      url: `${this.baseUrl()}/openai/v1/audio/speech`,

      method: "POST",

      headers: {
        ...createAuthorizationHeaders(apiKey, this.config.headers),

        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        model: model.modelId,

        input: request.text,

        voice: request.voice ?? "autumn",

        response_format: request.format ?? "wav",

        speed: request.speed,
      }),

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    const audio = new Uint8Array(await response.arrayBuffer());

    return {
      type: "text_to_speech",

      providerId: this.id,

      model: model.modelId,

      audio,

      mimeType: this.mimeTypeForAudio(request.format),
    };
  }

  // ========================================================================
  // Health
  // ========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<CloudHealth> {
    const startedAt = Date.now();

    try {
      const apiKey = await resolveCredential(
        this.config,
        this.credentialResolver,
      );

      const response = await this.http.raw({
        url: `${this.baseUrl()}/openai/v1/models`,

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
          error instanceof Error ? error.message : "Groq health check failed.",
      };
    }
  }

  private baseUrl(): string {
    return this.config.baseUrl.replace(/\/+$/, "") || "https://api.groq.com";
  }

  private toGroqMessages(
    messages: readonly CloudMessage[],
  ): readonly Record<string, unknown>[] {
    return messages.map((message) => ({
      role: message.role,

      content: message.content,
    }));
  }

  private extractMessageText(content: string | null | undefined): string {
    return content ?? "";
  }

  private mimeTypeForAudio(
    format: "wav" | "mp3" | "ogg" | "flac" | "mulaw" | undefined,
  ): string {
    switch (format) {
      case "mp3":
        return "audio/mpeg";

      case "ogg":
        return "audio/ogg";

      case "flac":
        return "audio/flac";

      case "mulaw":
        return "audio/basic";

      case "wav":
      default:
        return "audio/wav";
    }
  }
}

// ============================================================================
// Groq wire types
// ============================================================================

interface GroqChatResponse {
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

interface GroqChatChunk {
  readonly choices?: readonly {
    readonly delta?: {
      readonly content?: string | null;
    };

    readonly finish_reason?: string | null;
  }[];
}

interface GroqTranscriptionResponse {
  readonly text?: string;

  readonly language?: string;

  readonly duration?: number;

  readonly segments?: readonly {
    readonly start: number;
    readonly end: number;
    readonly text: string;
  }[];
}

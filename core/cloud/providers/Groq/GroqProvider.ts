// ============================================================================
// FILE: core/cloud/providers/Groq/GroqProvider.ts
// PURPOSE:
// Production Groq cloud provider adapter.
//
// SUPPORTED:
// - text generation
// - streaming text generation
// - speech-to-text
// - text-to-speech
//
// AUTH:
// CloudCredentialResolver only.
//
// BASE URL:
// The configured Groq base URL already includes:
//
//   https://api.groq.com/openai/v1
//
// Therefore endpoint paths MUST NOT append /openai/v1 again.
//
// GPT-OSS:
// Groq GPT-OSS models are reasoning models.
//
// Veyra therefore:
// - uses max_completion_tokens
// - can control reasoning_effort
// - excludes reasoning from normal assistant text
// - never maps reasoning into response.text
//
// DEBUGGING:
// Set GROQ_DEBUG_WIRE=true to enable sanitized local wire diagnostics.
//
// IMPORTANT:
// Authorization headers/API keys are NEVER logged.
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

// ============================================================================
// PROVIDER
// ============================================================================

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

  // ========================================================================
  // CONSTRUCTOR
  // ========================================================================

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

  // ========================================================================
  // EXECUTION
  // ========================================================================

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
            retryable: false,
          },
        );
    }
  }

  // ========================================================================
  // TEXT GENERATION
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
          retryable: false,
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

    const requestBody: GroqChatRequest = {
      model: model.modelId,

      messages: this.toGroqMessages(request.messages),

      temperature: request.options?.temperature,

      top_p: request.options?.topP,

      max_completion_tokens: request.options?.maxOutputTokens,

      stop: request.options?.stopSequences,

      // GPT-OSS reasoning should not become
      // Veyra's visible assistant response.
      include_reasoning: false,

      // Low reasoning is sufficient for normal
      // smoke tests and reduces unnecessary
      // reasoning-token consumption.
      reasoning_effort: this.isGptOssModel(model.modelId) ? "low" : undefined,

      stream: false,
    };

    this.traceRequest(requestBody, "non-streaming");

    const response = await this.http.json<GroqChatResponse>({
      url: `${this.baseUrl()}/chat/completions`,

      method: "POST",

      headers: createAuthorizationHeaders(apiKey, this.config.headers),

      body: requestBody,

      signal: options.signal,

      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
    });

    this.traceResponse(response, "non-streaming");

    const choice = response.choices?.[0];

    if (!choice) {
      throw new CloudError(
        "Groq returned no completion choices.",
        "INVALID_RESPONSE",
        {
          providerId: this.id,
          retryable: false,
        },
      );
    }

    const text = this.extractMessageText(choice.message?.content);

    if (!text) {
      const finishReason = choice.finish_reason ?? "unknown";

      const reasoningReturned =
        typeof choice.message?.reasoning === "string" &&
        choice.message.reasoning.length > 0;

      throw new CloudError(
        [
          `Groq returned a completion without final text content.`,
          `model=${model.modelId}`,
          `finish_reason=${finishReason}`,
          `reasoning_returned=${reasoningReturned}`,
        ].join(" "),
        "INVALID_RESPONSE",
        {
          providerId: this.id,
          retryable: false,
        },
      );
    }

    return {
      type: "text_generation",

      providerId: this.id,

      model: model.modelId,

      text,

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
  // STREAMING
  // ========================================================================

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

  // ========================================================================
  // LAZY STREAM
  // ========================================================================

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

  // ========================================================================
  // CREATE STREAM
  // ========================================================================

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

    const requestBody: GroqChatRequest = {
      model: modelId,

      messages: this.toGroqMessages(request.messages),

      temperature: request.options?.temperature,

      top_p: request.options?.topP,

      max_completion_tokens: request.options?.maxOutputTokens,

      stop: request.options?.stopSequences,

      include_reasoning: false,

      reasoning_effort: this.isGptOssModel(modelId) ? "low" : undefined,

      stream: true,
    };

    this.traceRequest(requestBody, "streaming");

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
      const data = payload as GroqChatChunk;

      const choice = data.choices?.[0];

      const delta = this.extractMessageText(choice?.delta?.content);

      if (!delta) {
        return {
          type: choice?.finish_reason === "stop" ? "done" : "metadata",

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
  // SPEECH TO TEXT
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
      this.config.defaultModels?.speech_to_text ?? "whisper-large-v3",
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
      url: `${this.baseUrl()}/audio/transcriptions`,

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
  // TEXT TO SPEECH
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
      url: `${this.baseUrl()}/audio/speech`,

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
  // HEALTH CHECK
  // ========================================================================

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
          error instanceof Error ? error.message : "Groq health check failed.",
      };
    }
  }

  // ========================================================================
  // URL
  // ========================================================================

  private baseUrl(): string {
    const configured = this.config.baseUrl.trim().replace(/\/+$/, "");

    if (!configured) {
      return "https://api.groq.com/openai/v1";
    }

    return configured;
  }

  // ========================================================================
  // MESSAGE MAPPING
  // ========================================================================

  private toGroqMessages(
    messages: readonly CloudMessage[],
  ): readonly GroqMessage[] {
    return messages.map((message) => ({
      role: message.role,

      content: message.content,
    }));
  }

  // ========================================================================
  // MODEL HELPERS
  // ========================================================================

  private isGptOssModel(modelId: string): boolean {
    return (
      modelId === "openai/gpt-oss-120b" || modelId === "openai/gpt-oss-20b"
    );
  }

  // ========================================================================
  // RESPONSE HELPERS
  // ========================================================================

  private extractMessageText(
    content: string | readonly GroqContentPart[] | null | undefined,
  ): string {
    if (typeof content === "string") {
      return content.trim();
    }

    if (!Array.isArray(content)) {
      return "";
    }

    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part.type === "text" && typeof part.text === "string") {
          return part.text;
        }

        return "";
      })
      .join("")
      .trim();
  }

  // ========================================================================
  // SAFE DEBUGGING
  // ========================================================================

  private isWireDebugEnabled(): boolean {
    return process.env.GROQ_DEBUG_WIRE === "true";
  }

  private traceRequest(
    body: GroqChatRequest,
    mode: "streaming" | "non-streaming",
  ): void {
    if (!this.isWireDebugEnabled()) {
      return;
    }

    const safeMessages = body.messages.map((message) => ({
      role: message.role,

      content:
        typeof message.content === "string"
          ? message.content
          : "[non-string content]",

      contentLength:
        typeof message.content === "string"
          ? message.content.length
          : undefined,
    }));

    console.log("");
    console.log("[Groq wire debug] REQUEST");
    console.log(
      JSON.stringify(
        {
          endpoint: `${this.baseUrl()}/chat/completions`,

          mode,

          model: body.model,

          messages: safeMessages,

          temperature: body.temperature,

          top_p: body.top_p,

          max_completion_tokens: body.max_completion_tokens,

          include_reasoning: body.include_reasoning,

          reasoning_effort: body.reasoning_effort,

          stream: body.stream,
        },
        null,
        2,
      ),
    );
  }

  private traceResponse(
    response: GroqChatResponse,
    mode: "streaming" | "non-streaming",
  ): void {
    if (!this.isWireDebugEnabled()) {
      return;
    }

    const choice = response.choices?.[0];

    const content = this.extractMessageText(choice?.message?.content);

    console.log("");
    console.log("[Groq wire debug] RESPONSE");

    console.log(
      JSON.stringify(
        {
          mode,

          id: response.id,

          choiceCount: response.choices?.length ?? 0,

          finishReason: choice?.finish_reason,

          hasContent: content.length > 0,

          contentLength: content.length,

          contentPreview: content.slice(0, 500),

          reasoningReturned:
            typeof choice?.message?.reasoning === "string" &&
            choice.message.reasoning.length > 0,

          reasoningLength:
            typeof choice?.message?.reasoning === "string"
              ? choice.message.reasoning.length
              : 0,

          usage: response.usage,
        },
        null,
        2,
      ),
    );
  }

  // ========================================================================
  // AUDIO MIME TYPES
  // ========================================================================

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
// GROQ WIRE TYPES
// ============================================================================

interface GroqMessage {
  readonly role: string;

  readonly content: string | readonly GroqContentPart[] | null;
}

interface GroqContentPart {
  readonly type?: string;

  readonly text?: string;
}

interface GroqChatRequest {
  readonly model: string;

  readonly messages: readonly GroqMessage[];

  readonly temperature?: number | undefined;

  readonly top_p?: number | undefined;

  readonly max_completion_tokens?: number | undefined;

  readonly stop?: string | readonly string[] | undefined;

  readonly include_reasoning?: boolean | undefined;

  readonly reasoning_effort?: "low" | "medium" | "high" | undefined;

  readonly stream: boolean;
}

interface GroqChatMessage {
  readonly content?: string | readonly GroqContentPart[] | null;

  readonly reasoning?: string | null;
}

interface GroqChatResponse {
  readonly id?: string;

  readonly choices?: readonly {
    readonly message?: GroqChatMessage;

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
      readonly content?: string | readonly GroqContentPart[] | null;

      readonly reasoning?: string | null;
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

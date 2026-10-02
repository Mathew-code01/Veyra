
// ============================================================================
// FILE: core/vision/providers/AIManagerVisionProvider.ts
//
// PURPOSE:
// Adapter between the Vision subsystem and Veyra's existing core/ai
// execution system.
//
// ARCHITECTURE:
//
//     VisionAnalyzer
//          │
//          │ VisionProvider
//          ▼
//     AIManagerVisionProvider
//          │
//          │ AIRequest
//          ▼
//     AIManager
//          │
//          ▼
//     AI routing / execution
//          │
//     ┌────┴─────────────────┐
//     ▼                      ▼
// LocalModelProvider     CloudAIProvider
//     │                      │
//     ▼                      ▼
// llama.cpp / Ollama      Gemini / Mistral / etc.
//
// IMPORTANT:
//
// VisionAnalyzer does NOT import AIManager.
//
// VisionAnalyzer depends only on the provider-neutral VisionProvider
// interface.
//
// This adapter is the composition-layer bridge between:
//     core/vision
// and:
//     core/ai
//
// RESPONSIBILITIES:
//
// - Validate that the selected AI provider supports vision.
// - Convert VisionProviderRequest into the shared AIRequest contract.
// - Convert raw image bytes into an AI-compatible data URL.
// - Preserve Vision cancellation.
// - Forward Vision metadata into the AI request safely.
// - Execute through AIManager.
// - Convert AIResponse back into VisionResponse.
// - Expose AI provider health through the VisionProvider health boundary.
//
// NON-RESPONSIBILITIES:
//
// - AI routing
// - retry policy
// - fallback policy
// - model loading
// - cloud transport
// - local runtime management
// - prompt ownership for the VisionAnalyzer
//
// Those remain inside core/ai and the lower-level provider/runtime layers.
// ============================================================================

import type { AIManager } from "../../ai/AIManager";

import type {
  AIRequest,
  AIResponse,
  AITextResponse,
} from "../../../shared/types/ai";

import { isAITextResponse } from "../../../shared/types/ai";

import type {
  VisionProvider,
  VisionProviderCapabilities,
  VisionProviderRequest,
  VisionResponse,
} from "./VisionProvider";

import { VisionError } from "../errors/VisionError";

import type {
  VisionProviderMetadata,
  VisionProviderUsage,
} from "../contracts/VisionTypes";

// ============================================================================
// OPTIONS
// ============================================================================

export interface AIManagerVisionProviderOptions {
  /**
   * Existing Veyra AI manager.
   *
   * The adapter delegates all actual AI execution to this manager.
   */
  readonly aiManager: AIManager;

  /**
   * Registered AI provider that this Vision adapter should use.
   *
   * Examples:
   *
   *     local
   *     ollama
   *     cloud:gemini
   *     cloud:mistral
   */
  readonly providerName: string;

  /**
   * Optional Vision-facing provider name.
   *
   * If omitted, the AI provider name is used.
   *
   * This allows multiple adapters to target the same underlying AI provider
   * with different Vision configurations if required later.
   */
  readonly name?: string;
}

// ============================================================================
// PROVIDER
// ============================================================================

export class AIManagerVisionProvider implements VisionProvider {
  public readonly name: string;

  public readonly capabilities: VisionProviderCapabilities;

  private readonly aiManager: AIManager;

  private readonly aiProviderName: string;

  public constructor(options: AIManagerVisionProviderOptions) {
    if (!options?.aiManager) {
      throw VisionError.invalidRequest(
        "AIManagerVisionProvider requires an AIManager.",
      );
    }

    const providerName = options.providerName?.trim();

    if (!providerName) {
      throw VisionError.invalidRequest(
        "AIManagerVisionProvider requires a providerName.",
      );
    }

    this.aiManager = options.aiManager;

    this.aiProviderName = providerName;

    const aiProvider = this.getAIProvider();

    if (!aiProvider.capabilities?.vision) {
      throw new VisionError(
        "VISION_CONFIGURATION_ERROR",
        `AI provider "${providerName}" does not support vision.`,
        {
          details: {
            stage: "provider",
            providerName,
            capability: "vision",
          },
        },
      );
    }

    const configuredName = options.name?.trim();

    this.name = configuredName || providerName;

    /**
     * These capabilities describe THIS Vision adapter.
     *
     * The adapter currently exposes only non-streaming VisionProvider.analyze().
     * Therefore streaming and structured output are deliberately false even if
     * the underlying AI provider supports them.
     */
    this.capabilities = Object.freeze({
      vision: true,

      textGeneration: aiProvider.capabilities.text,

      structuredOutput: false,

      streaming: false,

      local: aiProvider.capabilities.local,
    });
  }

  // ==========================================================================
  // ANALYZE
  // ==========================================================================

  public async analyze(
    request: VisionProviderRequest,
  ): Promise<VisionResponse> {
    if (!request) {
      throw VisionError.invalidRequest(
        "AIManagerVisionProvider requires a Vision provider request.",
      );
    }

    if (!request.image) {
      throw VisionError.invalidImage(
        "AIManagerVisionProvider requires an image.",
      );
    }

    if (!(request.image.data instanceof Uint8Array)) {
      throw VisionError.invalidImage(
        "Vision provider image data must be a Uint8Array.",
      );
    }

    if (!request.image.data.byteLength) {
      throw VisionError.invalidImage(
        "Vision provider image cannot be empty.",
      );
    }

    const mimeType = request.image.mimeType?.trim().toLowerCase();

    if (!mimeType) {
      throw VisionError.invalidRequest(
        "Vision provider image MIME type is required.",
      );
    }

    if (!mimeType.startsWith("image/")) {
      throw VisionError.unsupportedMimeType(mimeType, {
        stage: "provider",
        providerName: this.name,
      });
    }

    throwIfAborted(request.signal);

    try {
      /**
       * Re-read the provider from AIManager at execution time.
       *
       * This avoids permanently retaining a stale provider object if the
       * AIManager replaces the registration for this provider name.
       */
      const aiProvider = this.getAIProvider();

      if (!aiProvider.capabilities.vision) {
        throw new VisionError(
          "VISION_CONFIGURATION_ERROR",
          `AI provider "${this.aiProviderName}" no longer advertises vision capability.`,
          {
            details: {
              stage: "provider",
              providerName: this.aiProviderName,
              capability: "vision",
            },
          },
        );
      }

      const imageDataUrl = createImageDataUrl(
        request.image.data,
        mimeType,
      );

      const aiRequest = this.createAIRequest({
        request,
        imageDataUrl,
        mimeType,
      });

      throwIfAborted(request.signal);

      const response = await this.aiManager.generate(aiRequest);

      throwIfAborted(request.signal);

      return this.toVisionResponse(response);
    } catch (error) {
      if (request.signal?.aborted) {
        throw VisionError.cancelled({
          stage: "provider",
          providerName: this.name,
          cause: error,
        });
      }

      if (error instanceof VisionError) {
        throw error;
      }

      throw VisionError.fromUnknown(error, "VISION_INTERNAL_ERROR", {
        stage: "provider",
        providerName: this.name,
        cause: error,
      });
    }
  }

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  public async healthCheck(signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);

    try {
      const provider = this.getAIProvider();

      const health = await provider.healthCheck(signal);

      return (
        health.status === "healthy" ||
        health.status === "degraded"
      );
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // AI REQUEST CREATION
  // ==========================================================================

  private createAIRequest(input: {
    readonly request: VisionProviderRequest;

    readonly imageDataUrl: string;

    readonly mimeType: string;
  }): AIRequest {
    const { request, imageDataUrl, mimeType } = input;

    const prompt = buildAIUserPrompt(request);

    const metadata = buildAIMetadata(request);

    const aiRequest: AIRequest = {
      requestId: createRequestId(),

      /**
       * Explicitly target the AI provider represented by this adapter.
       *
       * The request still enters AIManager rather than calling the provider
       * directly, so the existing AI execution boundary remains intact.
       */
      provider: this.aiProviderName,

      model: request.modelName?.trim() || undefined,

      /**
       * VisionProvider currently does not expose an AIRequestMode.
       *
       * "general" is therefore the correct neutral shared mode.
       */
      mode: "general",

      messages: Object.freeze([
        Object.freeze({
          role: "system",
          content:
            "You are Veyra's visual understanding component. " +
            "Analyze only information supported by the supplied image. " +
            "Do not invent unreadable text, objects, values, labels, " +
            "relationships, or details. Explicitly identify uncertainty " +
            "when the image does not provide enough evidence.",
        }),

        Object.freeze({
          role: "user",
          content: prompt,
        }),
      ]),

      vision: Object.freeze({
        imageDataUrl,

        imageMimeType: mimeType,
      }),

      signal: request.signal,

      stream: false,

      options: Object.freeze({
        responseFormat: "text",
      }),

      metadata,
    };

    return Object.freeze(aiRequest);
  }

  // ==========================================================================
  // AI RESPONSE → VISION RESPONSE
  // ==========================================================================

  private toVisionResponse(response: AIResponse): VisionResponse {
    if (!isAITextResponse(response)) {
      throw new VisionError(
        "VISION_INTERNAL_ERROR",
        `AI provider "${this.aiProviderName}" returned a non-text response for Vision analysis.`,
        {
          details: {
            stage: "provider",
            providerName: this.aiProviderName,
            responseType: response.type,
          },
        },
      );
    }

    const textResponse: AITextResponse = response;

    const description = textResponse.text?.trim();

    if (!description) {
      throw new VisionError(
        "VISION_INTERNAL_ERROR",
        `AI provider "${this.aiProviderName}" returned an empty Vision response.`,
        {
          details: {
            stage: "provider",
            providerName: this.aiProviderName,
            responseType: textResponse.type,
          },
        },
      );
    }

    const metadata = textResponse.metadata;

    const providerMetadata: VisionProviderMetadata = Object.freeze({
      providerName: metadata.provider || this.aiProviderName,

      modelName: metadata.model || undefined,

      requestId: metadata.requestId,

      executionTarget: this.getExecutionTarget(),

      usage: toVisionUsage(metadata.usage),

      metadata: metadata.details,
    });

    return Object.freeze({
      description,

      provider: providerMetadata,

      metadata: Object.freeze({
        "ai.responseType": textResponse.type,

        "ai.provider": metadata.provider,

        "ai.model": metadata.model,

        "ai.requestId": metadata.requestId,

        ...(metadata.finishReason
          ? {
              "ai.finishReason": metadata.finishReason,
            }
          : {}),

        ...(metadata.cached !== undefined
          ? {
              "ai.cached": metadata.cached,
            }
          : {}),
      }),
    });
  }

  // ==========================================================================
  // AI PROVIDER ACCESS
  // ==========================================================================

  private getAIProvider() {
    try {
      return this.aiManager.getProvider(this.aiProviderName);
    } catch (error) {
      throw VisionError.fromUnknown(
        error,
        "VISION_CONFIGURATION_ERROR",
        {
          stage: "provider",
          providerName: this.aiProviderName,
          cause: error,
        },
      );
    }
  }

  // ==========================================================================
  // EXECUTION TARGET
  // ==========================================================================

  private getExecutionTarget(): "local" | "cloud" {
    const provider = this.getAIProvider();

    return provider.capabilities.local ? "local" : "cloud";
  }
}

// ============================================================================
// PROMPT
// ============================================================================

function buildAIUserPrompt(request: VisionProviderRequest): string {
  const prompt = request.prompt?.trim();

  if (prompt) {
    return prompt;
  }

  const question = request.question?.trim();

  if (question) {
    return question;
  }

  const detail = request.detail ?? "high";

  const language = request.language?.trim();

  const sections: string[] = [
    "Analyze the supplied image.",

    `Requested visual detail level: ${detail}.`,
  ];

  if (language) {
    sections.push(`Preferred language: ${language}.`);
  }

  sections.push(
    "",
    "Describe the important visible information accurately.",
    "Preserve visible text, values, labels, relationships, and structure.",
    "Do not invent information that cannot be supported by the image.",
  );

  return sections.join("\n");
}

// ============================================================================
// METADATA
// ============================================================================

function buildAIMetadata(
  request: VisionProviderRequest,
): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {};

  if (request.detail) {
    metadata["vision.detail"] = request.detail;
  }

  if (request.language?.trim()) {
    metadata["vision.language"] = request.language.trim();
  }

  for (const [key, value] of Object.entries(request.metadata ?? {})) {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      continue;
    }

    metadata[`vision.${normalizedKey}`] = serializeMetadataValue(value);
  }

  return Object.freeze(metadata);
}

function serializeMetadataValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  try {
    const serialized = JSON.stringify(value);

    return serialized ?? String(value);
  } catch {
    return String(value);
  }
}

// ============================================================================
// IMAGE DATA URL
// ============================================================================

function createImageDataUrl(
  data: Uint8Array,
  mimeType: string,
): string {
  return `data:${mimeType};base64,${encodeBase64(data)}`;
}

/**
 * Portable base64 encoder.
 *
 * This intentionally avoids a dependency on Node's Buffer so the adapter
 * remains usable in desktop/browser-compatible execution environments.
 */
function encodeBase64(data: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  let output = "";

  for (let index = 0; index < data.length; index += 3) {
    const byte1 = data[index];

    const hasByte2 = index + 1 < data.length;
    const hasByte3 = index + 2 < data.length;

    const byte2 = hasByte2 ? data[index + 1] : 0;
    const byte3 = hasByte3 ? data[index + 2] : 0;

    const combined =
      (byte1 << 16) |
      (byte2 << 8) |
      byte3;

    output += alphabet[(combined >> 18) & 0x3f];

    output += alphabet[(combined >> 12) & 0x3f];

    output += hasByte2
      ? alphabet[(combined >> 6) & 0x3f]
      : "=";

    output += hasByte3
      ? alphabet[combined & 0x3f]
      : "=";
  }

  return output;
}

// ============================================================================
// USAGE MAPPING
// ============================================================================

function toVisionUsage(
  usage:
    | {
        readonly inputTokens?: number;
        readonly outputTokens?: number;
        readonly totalTokens?: number;
      }
    | undefined,
): VisionProviderUsage | undefined {
  if (!usage) {
    return undefined;
  }

  const result: VisionProviderUsage = {
    ...(usage.inputTokens !== undefined
      ? {
          inputTokens: usage.inputTokens,
        }
      : {}),

    ...(usage.outputTokens !== undefined
      ? {
          outputTokens: usage.outputTokens,
        }
      : {}),

    ...(usage.totalTokens !== undefined
      ? {
          totalTokens: usage.totalTokens,
        }
      : {}),
  };

  return Object.keys(result).length > 0
    ? Object.freeze(result)
    : undefined;
}

// ============================================================================
// REQUEST ID
// ============================================================================

function createRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  const timestamp = Date.now().toString(16);

  const random = Math.random()
    .toString(16)
    .slice(2)
    .padEnd(24, "0");

  return [
    timestamp.slice(-8),
    random.slice(0, 4),
    random.slice(4, 8),
    random.slice(8, 12),
    random.slice(12, 24),
  ].join("-");
}

// ============================================================================
// CANCELLATION
// ============================================================================

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) {
    return;
  }

  throw VisionError.cancelled({
    stage: "provider",
  });
}

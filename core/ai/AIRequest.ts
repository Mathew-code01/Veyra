// core/ai/AIRequest.ts

export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  readonly role: AIMessageRole;
  readonly content: string;
}

/**
 * Optional multimodal input attached to an AI request.
 *
 * The model provider decides whether the selected model/runtime
 * can actually process the supplied image.
 */
export interface AIVisionInput {
  /**
   * Local image path.
   *
   * Example:
   * C:\Users\MATTHEW\Pictures\screenshot.png
   */
  readonly imagePath?: string;

  /**
   * Base64/data URL representation of an image.
   *
   * Example:
   * data:image/png;base64,...
   */
  readonly imageDataUrl?: string;

  /**
   * Optional MIME type when imagePath is supplied.
   */
  readonly imageMimeType?: string;
}

export interface AIRequestOptions {
  readonly temperature?: number;

  readonly maxTokens?: number;

  readonly topP?: number;

  readonly topK?: number;

  readonly stopSequences?: readonly string[];

  readonly responseFormat?: "text" | "json";

  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface AIRequest {
  /**
   * Stable identifier for the request.
   */
  readonly requestId: string;

  /**
   * Optional explicit model ID.
   *
   * Example:
   * qwen3-0.6b-q4
   */
  readonly model?: string;

  /**
   * Ordered conversation messages.
   */
  readonly messages: readonly AIMessage[];

  /**
   * Optional generation settings.
   */
  readonly options?: AIRequestOptions;

  /**
   * Optional multimodal input.
   */
  readonly vision?: AIVisionInput;

  /**
   * Abort signal owned by the caller.
   */
  readonly signal?: AbortSignal;

  /**
   * Optional request timeout.
   */
  readonly timeoutMs?: number;
}

/**
 * Create a new AI request.
 */
export function createAIRequest(
  messages: readonly AIMessage[],
  options: Omit<AIRequest, "requestId" | "messages"> = {},
): AIRequest {
  return Object.freeze({
    requestId: crypto.randomUUID(),
    messages: Object.freeze([...messages]),
    ...options,
  });
}

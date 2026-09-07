// core/ai/GeminiProvider.ts

import { AIError } from "./AIError";
import type { AIProvider, AIProviderHealth } from "./AIProvider";
import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiPart[];
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GeminiProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  readonly capabilities = {
    streaming: true,
    vision: true,
    structuredOutput: true,
    local: false,
  } as const;

  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("Gemini API key is required.");
    }

    this.apiKey = options.apiKey;
    this.defaultModel = options.model ?? "gemini-3.7-flash";

    this.baseUrl =
      options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  private getModel(request: AIRequest): string {
    return request.model ?? this.defaultModel;
  }

  private buildContents(request: AIRequest) {
    return request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));
  }

  private buildBody(request: AIRequest) {
    const systemMessage = request.messages.find(
      (message) => message.role === "system",
    );

    const options = request.options;

    return {
      ...(systemMessage
        ? {
            systemInstruction: {
              parts: [{ text: systemMessage.content }],
            },
          }
        : {}),
      contents: this.buildContents(request),
      generationConfig: {
        ...(options?.temperature !== undefined && {
          temperature: options.temperature,
        }),
        ...(options?.maxTokens !== undefined && {
          maxOutputTokens: options.maxTokens,
        }),
        ...(options?.topP !== undefined && {
          topP: options.topP,
        }),
        ...(options?.topK !== undefined && {
          topK: options.topK,
        }),
        ...(options?.stopSequences && {
          stopSequences: options.stopSequences,
        }),
        ...(options?.responseFormat === "json" && {
          responseMimeType: "application/json",
        }),
      },
    };
  }

  private async request(url: string, request: AIRequest): Promise<Response> {
    try {
      return await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(this.buildBody(request)),
        signal: request.signal,
      });
    } catch (error) {
      throw new AIError("Unable to connect to Gemini.", "NETWORK", {
        retryable: true,
        details: {
          provider: this.name,
          model: this.getModel(request),
          cause: error,
        },
      });
    }
  }

  private async parseError(response: Response): Promise<never> {
    let message = `Gemini request failed with status ${response.status}.`;

    try {
      const data = await response.json();

      const apiMessage = data?.error?.message;

      if (typeof apiMessage === "string") {
        message = apiMessage;
      }
    } catch {
      // Ignore malformed error payload.
    }

    let code: ConstructorParameters<typeof AIError>[1] = "PROVIDER";

    if (response.status === 401) {
      code = "AUTHENTICATION";
    } else if (response.status === 403) {
      code = "AUTHORIZATION";
    } else if (response.status === 404) {
      code = "MODEL_NOT_FOUND";
    } else if (response.status === 429) {
      code = "RATE_LIMIT";
    } else if (response.status >= 500) {
      code = "UNAVAILABLE";
    }

    throw new AIError(message, code, {
      retryable: response.status === 429 || response.status >= 500,
      details: {
        provider: this.name,
        status: response.status,
        retryAfterMs: response.status === 429 ? 1000 : undefined,
      },
    });
  }

  private extractText(data: GeminiResponse): string {
    return (
      data.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("") ?? ""
    );
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const startedAt = performance.now();
    const model = this.getModel(request);

    const response = await this.request(
      `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`,
      request,
    );

    if (!response.ok) {
      await this.parseError(response);
    }

    const data = (await response.json()) as GeminiResponse;

    const text = this.extractText(data);

    if (!text && data.candidates?.length) {
      throw new AIError(
        "Gemini returned an empty response.",
        "INVALID_RESPONSE",
        {
          retryable: false,
          details: {
            provider: this.name,
            model,
          },
        },
      );
    }

    return {
      text,
      metadata: {
        provider: this.name,
        model,
        requestId: request.requestId,
        latencyMs: Math.round(performance.now() - startedAt),
        finishReason: data.candidates?.[0]?.finishReason,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount,
          outputTokens: data.usageMetadata?.candidatesTokenCount,
          totalTokens: data.usageMetadata?.totalTokenCount,
        },
      },
    };
  }

  async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const model = this.getModel(request);

    const response = await this.request(
      `${this.baseUrl}/models/${encodeURIComponent(
        model,
      )}:streamGenerateContent?alt=sse`,
      request,
    );

    if (!response.ok) {
      await this.parseError(response);
    }

    if (!response.body) {
      throw new AIError(
        "Gemini returned no streaming body.",
        "INVALID_RESPONSE",
        {
          retryable: true,
          details: {
            provider: this.name,
            model,
          },
        },
      );
    }

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, {
          stream: true,
        });

        const lines = buffer.split("\n");

        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();

          if (!trimmed || !trimmed.startsWith("data:")) {
            continue;
          }

          const json = trimmed.slice(5).trim();

          if (!json || json === "[DONE]") {
            continue;
          }

          let data: GeminiResponse;

          try {
            data = JSON.parse(json);
          } catch {
            continue;
          }

          const text = this.extractText(data);

          const finishReason = data.candidates?.[0]?.finishReason;

          yield {
            text,
            requestId: request.requestId,
            provider: this.name,
            model,
            done: Boolean(finishReason),
            finishReason,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield {
      text: "",
      requestId: request.requestId,
      provider: this.name,
      model,
      done: true,
    };
  }

  async healthCheck(signal?: AbortSignal): Promise<AIProviderHealth> {
    const startedAt = performance.now();

    try {
      const request = {
        requestId: crypto.randomUUID(),
        messages: [
          {
            role: "user" as const,
            content: "Reply with OK.",
          },
        ],
        options: {
          maxTokens: 4,
        },
        signal,
      };

      await this.generate(request);

      return {
        provider: this.name,
        status: "healthy",
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        provider: this.name,
        status: "unavailable",
        latencyMs: Math.round(performance.now() - startedAt),
        checkedAt: Date.now(),
        error: error instanceof Error ? error.message : "Health check failed.",
      };
    }
  }
}
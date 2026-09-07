// core/ai/OllamaProvider.ts

import { AIError } from "./AIError";
import type { AIProvider, AIProviderHealth } from "./AIProvider";
import type { AIRequest } from "./AIRequest";
import type { AIResponse, AIStreamChunk } from "./AIResponse";

interface OllamaResponse {
  model: string;
  response?: string;
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
}

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";

  readonly capabilities = {
    streaming: true,
    vision: true,
    structuredOutput: true,
    local: true,
  } as const;

  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:11434";

    this.defaultModel = options.model ?? "llama3.2";
  }

  private getModel(request: AIRequest): string {
    return request.model ?? this.defaultModel;
  }

  private buildOptions(request: AIRequest) {
    return {
      ...(request.options?.temperature !== undefined && {
        temperature: request.options.temperature,
      }),
      ...(request.options?.topP !== undefined && {
        top_p: request.options.topP,
      }),
      ...(request.options?.topK !== undefined && {
        top_k: request.options.topK,
      }),
      ...(request.options?.maxTokens !== undefined && {
        num_predict: request.options.maxTokens,
      }),
    };
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const startedAt = performance.now();
    const model = this.getModel(request);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: request.messages,
          options: this.buildOptions(request),
          ...(request.options?.responseFormat === "json" && {
            format: "json",
          }),
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw new AIError("Unable to connect to Ollama.", "NETWORK", {
        retryable: true,
        details: {
          provider: this.name,
          model,
          cause: error,
        },
      });
    }

    if (!response.ok) {
      const message = await response.text().catch(() => "");

      throw new AIError(
        message || `Ollama returned ${response.status}.`,
        response.status === 404
          ? "MODEL_NOT_FOUND"
          : response.status >= 500
            ? "UNAVAILABLE"
            : "PROVIDER",
        {
          retryable: response.status >= 500,
          details: {
            provider: this.name,
            model,
            status: response.status,
          },
        },
      );
    }

    const data = (await response.json()) as OllamaResponse;

    return {
      text: data.response ?? "",
      metadata: {
        provider: this.name,
        model,
        requestId: request.requestId,
        latencyMs: Math.round(performance.now() - startedAt),
        finishReason: data.done_reason,
        usage: {
          inputTokens: data.prompt_eval_count,
          outputTokens: data.eval_count,
          totalTokens:
            data.prompt_eval_count !== undefined &&
            data.eval_count !== undefined
              ? data.prompt_eval_count + data.eval_count
              : undefined,
        },
      },
    };
  }

  async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const model = this.getModel(request);

    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: request.messages,
          options: this.buildOptions(request),
        }),
        signal: request.signal,
      });
    } catch (error) {
      throw new AIError("Unable to connect to Ollama.", "NETWORK", {
        retryable: true,
        details: {
          provider: this.name,
          model,
          cause: error,
        },
      });
    }

    if (!response.ok) {
      throw new AIError(
        `Ollama streaming request failed with ${response.status}.`,
        response.status >= 500 ? "UNAVAILABLE" : "PROVIDER",
        {
          retryable: response.status >= 500,
          details: {
            provider: this.name,
            model,
            status: response.status,
          },
        },
      );
    }

    if (!response.body) {
      throw new AIError(
        "Ollama returned no response stream.",
        "INVALID_RESPONSE",
        {
          retryable: true,
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
          if (!line.trim()) {
            continue;
          }

          let data: OllamaResponse;

          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }

          yield {
            text: data.response ?? "",
            requestId: request.requestId,
            provider: this.name,
            model,
            done: data.done,
            finishReason: data.done_reason,
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async healthCheck(signal?: AbortSignal): Promise<AIProviderHealth> {
    const startedAt = performance.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal,
      });

      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}.`);
      }

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
        error:
          error instanceof Error ? error.message : "Ollama is unavailable.",
      };
    }
  }
}
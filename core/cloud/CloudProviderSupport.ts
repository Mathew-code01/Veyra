// ============================================================================
// FILE: core/cloud/CloudProviderSupport.ts
// PURPOSE:
// Shared implementation utilities for cloud providers.
//
// RESPONSIBILITIES:
// - credential resolution
// - authorization headers
// - model lookup
// - capability validation
// - SSE parsing
// - stream creation
// - common response validation
//
// DOES NOT:
// - choose providers
// - implement fallback policy
// - contain API keys
// - implement interview/business logic
// ============================================================================

import type { CloudCredentialResolver } from "./CloudCredential";

import type { CloudModel } from "./CloudModel";

import type { CloudProviderConfig } from "./CloudProviderConfig";

import type { CloudCapabilities } from "./CloudCapabilities";

import type { CloudExecutionOptions } from "./contracts/CloudRequest";

import type { CloudStream, CloudStreamEvent } from "./contracts/CloudStream";

import { CloudError } from "./contracts/CloudError";

import { CloudHttpClient } from "./CloudHttpClient";

export interface CloudProviderDependencies {
  readonly http?: CloudHttpClient;

  readonly credentialResolver?: CloudCredentialResolver;
}

export interface ResolvedCloudProviderDependencies {
  readonly http: CloudHttpClient;

  readonly credentialResolver: CloudCredentialResolver;
}

export function resolveProviderDependencies(
  dependencies: CloudProviderDependencies = {},
): ResolvedCloudProviderDependencies {
  if (dependencies.credentialResolver) {
    return {
      http: dependencies.http ?? new CloudHttpClient(),

      credentialResolver: dependencies.credentialResolver,
    };
  }

  throw new CloudError(
    "A CloudCredentialResolver is required.",
    "CONFIGURATION",
    {
      retryable: false,
    },
  );
}

export async function resolveCredential(
  config: CloudProviderConfig,
  resolver: CloudCredentialResolver,
): Promise<string> {
  if (!config.credential) {
    throw new CloudError(
      `No credential is configured for cloud provider "${config.id}".`,
      "CONFIGURATION",
      {
        retryable: false,
        providerId: config.id,
      },
    );
  }

  const value = await resolver.resolve(config.credential);

  if (!value) {
    throw new CloudError(
      `Credential "${config.credential.id}" for provider "${config.id}" could not be resolved.`,
      "AUTHENTICATION",
      {
        retryable: false,
        providerId: config.id,
      },
    );
  }

  return value;
}

export function resolveModel(
  models: readonly CloudModel[],
  modelId?: string,
  fallbackModelId?: string,
): CloudModel {
  const requested = modelId?.trim() || fallbackModelId?.trim();

  if (!requested) {
    throw new CloudError("No cloud model was specified.", "CONFIGURATION", {
      retryable: false,
    });
  }

  const model = models.find(
    (candidate) =>
      candidate.modelId === requested || candidate.id === requested,
  );

  if (!model) {
    throw new CloudError(
      `Cloud model "${requested}" is not registered.`,
      "NOT_FOUND",
      {
        retryable: false,
        details: {
          requestedModel: requested,
        },
      },
    );
  }

  return model;
}

export function assertCapability(
  capabilities: CloudCapabilities,
  capability:
    | "textGeneration"
    | "streaming"
    | "vision"
    | "speechToText"
    | "textToSpeech"
    | "embeddings"
    | "documentAnalysis",
  providerId: string,
): void {
  if (!capabilities[capability]) {
    throw new CloudError(
      `Provider "${providerId}" does not support "${capability}".`,
      "UNSUPPORTED",
      {
        retryable: false,
        providerId,
      },
    );
  }
}

export function createAuthorizationHeaders(
  apiKey: string,
  additionalHeaders: Readonly<Record<string, string>> | undefined = undefined,
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    ...(additionalHeaders ?? {}),
  };
}

export function createApiKeyHeaders(
  apiKey: string,
  additionalHeaders: Readonly<Record<string, string>> | undefined = undefined,
): Record<string, string> {
  return {
    "x-goog-api-key": apiKey,
    ...(additionalHeaders ?? {}),
  };
}

export function createStream(
  providerId: string,
  model: string,
  response: Response,
  parser: (payload: unknown, sequence: number) => CloudStreamEvent | null,
): CloudStream {
  const body = response.body;

  if (!body) {
    throw new CloudError(
      "Cloud provider returned an empty streaming body.",
      "INVALID_RESPONSE",
      {
        retryable: false,
        providerId,
      },
    );
  }

  const controller = new AbortController();

  let cancelled = false;

  const stream = async function* (): AsyncGenerator<CloudStreamEvent> {
    const reader = body.getReader();

    const decoder = new TextDecoder();

    let buffer = "";
    let sequence = 0;

    try {
      while (!cancelled) {
        const result = await reader.read();

        if (result.done) {
          break;
        }

        buffer += decoder.decode(result.value, {
          stream: true,
        });

        const events = buffer.split(/\r?\n\r?\n/);

        buffer = events.pop() ?? "";

        for (const event of events) {
          if (cancelled) {
            break;
          }

          const payload = parseSSEPayload(event);

          if (payload === null || payload === "[DONE]") {
            continue;
          }

          const parsed = safeJsonParse(payload);

          if (parsed === undefined) {
            continue;
          }

          const mapped = parser(parsed, sequence++);

          if (mapped) {
            yield mapped;
          }
        }
      }

      if (buffer.trim()) {
        const payload = parseSSEPayload(buffer);

        if (payload && payload !== "[DONE]") {
          const parsed = safeJsonParse(payload);

          if (parsed !== undefined) {
            const mapped = parser(parsed, sequence++);

            if (mapped) {
              yield mapped;
            }
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Stream is already closed/cancelled.
      }
    }
  };

  const iterator = stream();

  return {
    providerId,

    model,

    startedAt: Date.now(),

    cancel: () => {
      cancelled = true;
      controller.abort();
    },

    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
}

export function parseSSEPayload(event: string): string | null {
  const lines = event.split(/\r?\n/);

  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  return dataLines.join("\n").trim();
}

export function safeJsonParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function normalizeContent(content: string | readonly unknown[]): string {
  if (typeof content === "string") {
    return content;
  }

  return content
    .map((part) => {
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        return (part as { text: string }).text;
      }

      return "";
    })
    .filter(Boolean)
    .join("");
}

export function toOpenAIMessageContent(
  content: string | readonly unknown[],
): string | readonly unknown[] {
  if (typeof content === "string") {
    return content;
  }

  return content;
}

export function createTimeoutOptions(
  options: CloudExecutionOptions | undefined,
  providerTimeoutMs: number,
): {
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
} {
  return {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? providerTimeoutMs,
  };
}

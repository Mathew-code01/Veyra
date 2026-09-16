// ============================================================================
// FILE: core/cloud/CloudProviderSupport.ts
// PURPOSE:
// Shared implementation utilities for cloud providers.
//
// RESPONSIBILITIES:
// - credential resolution
// - authorization headers
// - API-key headers
// - model lookup
// - capability validation
// - SSE parsing
// - cancellable lazy stream creation
// - common content normalization
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

// ============================================================================
// DEPENDENCIES
// ============================================================================

export interface CloudProviderDependencies {
  readonly http?: CloudHttpClient;

  readonly credentialResolver?: CloudCredentialResolver;
}

export interface ResolvedCloudProviderDependencies {
  readonly http: CloudHttpClient;

  readonly credentialResolver: CloudCredentialResolver;
}

// ============================================================================
// DEPENDENCY RESOLUTION
// ============================================================================

export function resolveProviderDependencies(
  dependencies: CloudProviderDependencies = {},
): ResolvedCloudProviderDependencies {
  if (!dependencies.credentialResolver) {
    throw new CloudError(
      "A CloudCredentialResolver is required.",
      "CONFIGURATION",
      {
        retryable: false,
      },
    );
  }

  return {
    http: dependencies.http ?? new CloudHttpClient(),

    credentialResolver: dependencies.credentialResolver,
  };
}

// ============================================================================
// CREDENTIALS
// ============================================================================

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

  if (!value || !value.trim()) {
    throw new CloudError(
      `Credential "${config.credential.id}" for provider "${config.id}" could not be resolved.`,
      "AUTHENTICATION",
      {
        retryable: false,
        providerId: config.id,
      },
    );
  }

  return value.trim();
}

// ============================================================================
// MODEL RESOLUTION
// ============================================================================

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

// ============================================================================
// CAPABILITY VALIDATION
// ============================================================================

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

// ============================================================================
// AUTH HEADERS
// ============================================================================

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

// ============================================================================
// STREAMING
// ============================================================================

export type CloudStreamResponseSource =
  Response | ((signal: AbortSignal) => Response | Promise<Response>);

function createLinkedAbortController(externalSignal?: AbortSignal): {
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  readonly cleanup: () => void;
} {
  const controller = new AbortController();

  if (!externalSignal) {
    return {
      controller,
      signal: controller.signal,
      cleanup: () => undefined,
    };
  }

  const abortFromExternal = (): void => {
    controller.abort();
  };

  if (externalSignal.aborted) {
    controller.abort();
  } else {
    externalSignal.addEventListener("abort", abortFromExternal, {
      once: true,
    });
  }

  return {
    controller,
    signal: controller.signal,
    cleanup: () => {
      externalSignal.removeEventListener("abort", abortFromExternal);
    },
  };
}

/**
 * Creates a CloudStream synchronously while allowing the underlying
 * network request and credential resolution to happen lazily.
 *
 * This is important because CloudProvider.stream() is intentionally
 * synchronous at the contract level.
 */
export function createStream(
  providerId: string,
  model: string,
  responseSource: CloudStreamResponseSource,
  parser: (payload: unknown, sequence: number) => CloudStreamEvent | null,
  externalSignal?: AbortSignal,
): CloudStream {
  const linked = createLinkedAbortController(externalSignal);

  let cancelled = false;

  const startedAt = Date.now();

  const stream = async function* (): AsyncGenerator<CloudStreamEvent> {
    let response: Response;

    try {
      if (cancelled || linked.signal.aborted) {
        return;
      }

      response =
        typeof responseSource === "function"
          ? await responseSource(linked.signal)
          : responseSource;

      if (cancelled || linked.signal.aborted) {
        return;
      }

      if (!response.body) {
        throw new CloudError(
          "Cloud provider returned an empty streaming body.",
          "INVALID_RESPONSE",
          {
            retryable: false,
            providerId,
          },
        );
      }

      const reader = response.body.getReader();

      const decoder = new TextDecoder();

      let buffer = "";

      let sequence = 0;

      try {
        while (!cancelled && !linked.signal.aborted) {
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
            if (cancelled || linked.signal.aborted) {
              break;
            }

            const payload = parseSSEPayload(event);

            if (payload === null) {
              continue;
            }

            if (payload === "[DONE]") {
              yield {
                type: "done",
                sequence: sequence++,
                providerId,
                model,
                timestamp: Date.now(),
              };

              cancelled = true;

              break;
            }

            const parsed = safeJsonParse(payload);

            if (parsed === undefined) {
              continue;
            }

            const mapped = parser(parsed, sequence++);

            if (mapped) {
              yield mapped;

              if (mapped.type === "done") {
                cancelled = true;
                break;
              }
            }
          }
        }

        if (!cancelled && !linked.signal.aborted && buffer.trim()) {
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
          // The stream may already have been closed or aborted.
        }
      }
    } finally {
      linked.cleanup();
    }
  };

  const iterator = stream();

  return {
    providerId,

    model,

    startedAt,

    cancel: () => {
      if (cancelled) {
        return;
      }

      cancelled = true;

      linked.controller.abort();
    },

    [Symbol.asyncIterator]() {
      return iterator;
    },
  };
}

// ============================================================================
// SSE
// ============================================================================

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

// ============================================================================
// SAFE JSON
// ============================================================================

export function safeJsonParse(value: string): unknown | undefined {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// ============================================================================
// CONTENT HELPERS
// ============================================================================

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
        typeof (
          part as {
            text?: unknown;
          }
        ).text === "string"
      ) {
        return (
          part as {
            text: string;
          }
        ).text;
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

// ============================================================================
// TIMEOUT
// ============================================================================

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

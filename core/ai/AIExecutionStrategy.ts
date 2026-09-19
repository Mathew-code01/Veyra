
// ============================================================================
// FILE: core/ai/AIExecutionStrategy.ts
// PURPOSE:
// Executes an AIExecutionPlan.
//
// RESPONSIBILITIES:
// - Execute the selected provider
// - Retry retryable failures
// - Respect retry limits
// - Respect AbortSignal
// - Fall back to the next candidate when safe
// - Execute streaming requests
// - Prevent unsafe streaming fallback after output has been emitted
// - Validate execution responses and stream termination
//
// NON-RESPONSIBILITIES:
// - Provider selection
// - Provider ranking
// - Cloud transport
// - Local model loading
// - Hardware inspection
// - Prompt construction
// - Interview reasoning
//
// IMPORTANT STREAMING RULE:
//
// Once user-visible text has been emitted, automatic fallback is disabled.
//
// Provider A:
//   "The answer is..."
//   failure
//
// Provider B:
//   "The answer is..."
//
// would produce duplicated/corrupted output.
//
// Therefore streaming fallback is only allowed before any non-empty text
// chunk has been emitted.
// ============================================================================

import type {
  AIResponse,
  AIStreamChunk,
} from "./AIResponse";

import {
  AIError,
} from "./AIError";

import type {
  AIExecutionPlan,
} from "./AIExecutionPlan";

import type {
  AIRoutingCandidate,
} from "./AIRoutingCandidate";

// ============================================================================
// TYPES
// ============================================================================

export interface AIExecutionResult<T> {
  readonly value: T;

  readonly provider: string;

  readonly runtime:
    | "local"
    | "cloud";

  readonly attempts: number;

  readonly fallbacks: number;

  readonly executedAt: number;
}

export interface AIExecutionFailure {
  readonly provider: string;

  readonly runtime:
    | "local"
    | "cloud";

  readonly attempts: number;

  readonly error: AIError;
}

export interface AIExecutionDiagnostics {
  readonly failures:
    readonly AIExecutionFailure[];

  readonly totalAttempts: number;

  readonly fallbackCount: number;

  readonly startedAt: number;

  readonly completedAt: number;
}

export interface AIExecutionStrategyOptions {
  /**
   * Observe provider attempts.
   *
   * This callback must never alter execution behavior.
   */
  readonly onAttempt?: (
    candidate: AIRoutingCandidate,
    attempt: number,
  ) => void;

  /**
   * Observe provider fallback.
   */
  readonly onFallback?: (
    failedCandidate: AIRoutingCandidate,
    nextCandidate: AIRoutingCandidate,
    error: AIError,
  ) => void;

  /**
   * Observe failed attempts.
   */
  readonly onFailure?: (
    candidate: AIRoutingCandidate,
    attempt: number,
    error: AIError,
  ) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function throwIfAborted(
  signal: AbortSignal | undefined,
): void {
  if (!signal?.aborted) {
    return;
  }

  throw new AIError(
    "AI execution was aborted.",
    "ABORTED",
    {
      retryable: false,
    },
  );
}

function isAbortError(
  error: unknown,
): boolean {
  if (
    typeof DOMException !==
    "undefined" &&
    error instanceof DOMException
  ) {
    return (
      error.name ===
      "AbortError"
    );
  }

  if (
    error instanceof Error &&
    error.name ===
      "AbortError"
  ) {
    return true;
  }

  return false;
}

function toAIError(
  error: unknown,
  candidate: AIRoutingCandidate,
): AIError {
  if (error instanceof AIError) {
    return error;
  }

  if (isAbortError(error)) {
    return new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "execution was aborted.",
      ].join(" "),
      "ABORTED",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,
        },

        cause: error,
      },
    );
  }

  if (error instanceof Error) {
    return new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        `failed: ${error.message}`,
      ].join(" "),
      "PROVIDER",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,
        },

        cause: error,
      },
    );
  }

  return new AIError(
    [
      `AI provider "${candidate.providerName}"`,
      `failed: ${String(error)}`,
    ].join(" "),
    "PROVIDER",
    {
      retryable: false,

      details: {
        provider:
          candidate.providerName,

        runtime:
          candidate.runtime,
      },

      cause: error,
    },
  );
}

function calculateRetryDelay(
  nextAttempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  if (nextAttempt <= 1) {
    return 0;
  }

  const exponent =
    Math.max(
      0,
      nextAttempt - 2,
    );

  const delayMs =
    baseDelayMs *
    Math.pow(
      2,
      exponent,
    );

  return Math.min(
    Math.max(
      0,
      delayMs,
    ),
    maxDelayMs,
  );
}

async function delay(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (milliseconds <= 0) {
    throwIfAborted(signal);
    return;
  }

  throwIfAborted(signal);

  await new Promise<void>(
    (resolve, reject) => {
      let timer:
        | ReturnType<typeof setTimeout>
        | undefined;

      const cleanup =
        (): void => {
          if (
            timer !== undefined
          ) {
            clearTimeout(timer);
            timer = undefined;
          }

          signal?.removeEventListener(
            "abort",
            onAbort,
          );
        };

      const onAbort =
        (): void => {
          cleanup();

          reject(
            new AIError(
              "AI execution was aborted while waiting for retry.",
              "ABORTED",
              {
                retryable: false,
              },
            ),
          );
        };

      timer = setTimeout(
        () => {
          cleanup();
          resolve();
        },
        milliseconds,
      );

      signal?.addEventListener(
        "abort",
        onAbort,
        {
          once: true,
        },
      );
    },
  );
}

// ============================================================================
// RESPONSE VALIDATION
// ============================================================================

function validateResponse(
  response: AIResponse,
  plan: AIExecutionPlan,
  candidate: AIRoutingCandidate,
): AIResponse {
  if (
    response === undefined ||
    response === null
  ) {
    throw new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "returned an empty response.",
      ].join(" "),
      "INVALID_RESPONSE",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          details: {
            requestId:
              plan.request.requestId,
          },
        },
      },
    );
  }

  if (
    response.metadata.requestId !==
    plan.request.requestId
  ) {
    throw new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "returned a response for a different request.",
      ].join(" "),
      "INVALID_RESPONSE",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          details: {
            expectedRequestId:
              plan.request.requestId,

            receivedRequestId:
              response.metadata.requestId,
          },
        },
      },
    );
  }

  if (
    response.metadata.provider !==
    candidate.providerName
  ) {
    throw new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "returned a response with an unexpected provider identity.",
      ].join(" "),
      "INVALID_RESPONSE",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          details: {
            expectedProvider:
              candidate.providerName,

            receivedProvider:
              response.metadata.provider,

            requestId:
              plan.request.requestId,
          },
        },
      },
    );
  }

  return response;
}

// ============================================================================
// STREAM VALIDATION
// ============================================================================

function validateStreamChunk(
  chunk: AIStreamChunk,
  plan: AIExecutionPlan,
  candidate: AIRoutingCandidate,
): void {
  if (
    chunk.requestId !==
    plan.request.requestId
  ) {
    throw new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "returned a stream chunk for a different request.",
      ].join(" "),
      "INVALID_RESPONSE",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          details: {
            expectedRequestId:
              plan.request.requestId,

            receivedRequestId:
              chunk.requestId,
          },
        },
      },
    );
  }

  if (
    chunk.provider !==
    candidate.providerName
  ) {
    throw new AIError(
      [
        `AI provider "${candidate.providerName}"`,
        "returned a stream chunk with an unexpected provider identity.",
      ].join(" "),
      "INVALID_RESPONSE",
      {
        retryable: false,

        details: {
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          details: {
            expectedProvider:
              candidate.providerName,

            receivedProvider:
              chunk.provider,

            requestId:
              plan.request.requestId,
          },
        },
      },
    );
  }
}

// ============================================================================
// STRATEGY
// ============================================================================

export class AIExecutionStrategy {
  private readonly options:
    AIExecutionStrategyOptions;

  public constructor(
    options: AIExecutionStrategyOptions = {},
  ) {
    this.options =
      Object.freeze({
        ...options,
      });
  }

  // ========================================================================
  // GENERATE
  // ========================================================================

  public async generate(
    plan: AIExecutionPlan,
  ): Promise<AIResponse> {
    const request =
      plan.request;

    throwIfAborted(
      request.signal,
    );

    const failures:
      AIExecutionFailure[] = [];

    let totalAttempts = 0;

    for (
      let candidateIndex = 0;
      candidateIndex <
      plan.candidates.length;
      candidateIndex += 1
    ) {
      const candidate =
        plan.candidates[
          candidateIndex
        ];

      if (!candidate) {
        continue;
      }

      const provider =
        candidate.provider;

      const maxAttempts =
        plan.policy.execution
          .maxAttemptsPerCandidate;

      for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt += 1
      ) {
        throwIfAborted(
          request.signal,
        );

        totalAttempts += 1;

        this.options.onAttempt?.(
          candidate,
          attempt,
        );

        try {
          const response =
            await provider.generate(
              request,
            );

          return validateResponse(
            response,
            plan,
            candidate,
          );
        } catch (error) {
          const aiError =
            toAIError(
              error,
              candidate,
            );

          failures.push({
            provider:
              candidate.providerName,

            runtime:
              candidate.runtime,

            attempts:
              attempt,

            error:
              aiError,
          });

          this.options.onFailure?.(
            candidate,
            attempt,
            aiError,
          );

          if (
            aiError.code ===
            "ABORTED"
          ) {
            throw aiError;
          }

          const attemptsRemaining =
            attempt <
            maxAttempts;

          if (
            aiError.retryable &&
            attemptsRemaining
          ) {
            const retryDelay =
              aiError.details
                .retryAfterMs ??
              calculateRetryDelay(
                attempt + 1,
                plan.policy.execution
                  .retryBaseDelayMs,
                plan.policy.execution
                  .retryMaxDelayMs,
              );

            await delay(
              retryDelay,
              request.signal,
            );

            continue;
          }

          break;
        }
      }

      const nextCandidate =
        plan.candidates[
          candidateIndex + 1
        ];

      if (
        !nextCandidate ||
        !plan.policy.execution
          .allowFallback
      ) {
        break;
      }

      const lastFailure =
        failures[
          failures.length - 1
        ];

      if (lastFailure) {
        this.options.onFallback?.(
          candidate,
          nextCandidate,
          lastFailure.error,
        );
      }
    }

    throw this.createExecutionFailure(
      failures,
      totalAttempts,
    );
  }

  // ========================================================================
  // STREAM
  // ========================================================================

  public stream(
    plan: AIExecutionPlan,
  ): AsyncIterable<AIStreamChunk> {
    return this.createStream(
      plan,
    );
  }

  private async *createStream(
    plan: AIExecutionPlan,
  ): AsyncIterable<AIStreamChunk> {
    const request =
      plan.request;

    throwIfAborted(
      request.signal,
    );

    let outputStarted =
      false;

    const failures:
      AIExecutionFailure[] = [];

    let totalAttempts = 0;

    for (
      let candidateIndex = 0;
      candidateIndex <
      plan.candidates.length;
      candidateIndex += 1
    ) {
      const candidate =
        plan.candidates[
          candidateIndex
        ];

      if (!candidate) {
        continue;
      }

      const provider =
        candidate.provider;

      if (
        !provider.capabilities
          .streaming
      ) {
        const error =
          new AIError(
            [
              `AI provider "${candidate.providerName}"`,
              "does not support streaming.",
            ].join(" "),
            "UNAVAILABLE",
            {
              retryable: false,

              details: {
                provider:
                  candidate.providerName,

                runtime:
                  candidate.runtime,
              },
            },
          );

        failures.push({
          provider:
            candidate.providerName,

          runtime:
            candidate.runtime,

          attempts: 0,

          error,
        });

        if (
          !plan.policy.execution
            .allowFallback
        ) {
          break;
        }

        const nextCandidate =
          plan.candidates[
            candidateIndex + 1
          ];

        if (
          nextCandidate
        ) {
          this.options.onFallback?.(
            candidate,
            nextCandidate,
            error,
          );
        }

        continue;
      }

      const maxAttempts =
        plan.policy.execution
          .maxAttemptsPerCandidate;

      for (
        let attempt = 1;
        attempt <= maxAttempts;
        attempt += 1
      ) {
        throwIfAborted(
          request.signal,
        );

        totalAttempts += 1;

        this.options.onAttempt?.(
          candidate,
          attempt,
        );

        let attemptEmittedOutput =
          false;

        let receivedTerminalChunk =
          false;

        try {
          const providerStream =
            provider.stream(
              request,
            );

          for await (
            const chunk of providerStream
          ) {
            throwIfAborted(
              request.signal,
            );

            validateStreamChunk(
              chunk,
              plan,
              candidate,
            );

            if (
              chunk.text.length > 0
            ) {
              outputStarted =
                true;

              attemptEmittedOutput =
                true;
            }

            if (
              chunk.done
            ) {
              receivedTerminalChunk =
                true;
            }

            yield chunk;

            if (
              chunk.done
            ) {
              break;
            }
          }

          /**
           * A provider stream ending without a terminal done chunk is an
           * invalid/incomplete response.
           *
           * We intentionally do not silently manufacture a done chunk.
           */
          if (
            !receivedTerminalChunk
          ) {
            throw new AIError(
              [
                `AI provider "${candidate.providerName}"`,
                "stream ended without a terminal done chunk.",
              ].join(" "),
              "INVALID_RESPONSE",
              {
                retryable: false,

                details: {
                  provider:
                    candidate.providerName,

                  runtime:
                    candidate.runtime,

                  details: {
                    requestId:
                      request.requestId,

                    outputStarted,
                  },
                },
              },
            );
          }

          return;
        } catch (error) {
          const aiError =
            toAIError(
              error,
              candidate,
            );

          failures.push({
            provider:
              candidate.providerName,

            runtime:
              candidate.runtime,

            attempts:
              attempt,

            error:
              aiError,
          });

          this.options.onFailure?.(
            candidate,
            attempt,
            aiError,
          );

          if (
            aiError.code ===
            "ABORTED"
          ) {
            throw aiError;
          }

          /**
           * Once output has reached the consumer, retrying or switching
           * providers would make the response ambiguous or duplicated.
           */
          if (
            outputStarted ||
            attemptEmittedOutput
          ) {
            throw aiError;
          }

          const attemptsRemaining =
            attempt <
            maxAttempts;

          if (
            aiError.retryable &&
            attemptsRemaining
          ) {
            const retryDelay =
              aiError.details
                .retryAfterMs ??
              calculateRetryDelay(
                attempt + 1,
                plan.policy.execution
                  .retryBaseDelayMs,
                plan.policy.execution
                  .retryMaxDelayMs,
              );

            await delay(
              retryDelay,
              request.signal,
            );

            continue;
          }

          break;
        }
      }

      const nextCandidate =
        plan.candidates[
          candidateIndex + 1
        ];

      if (
        !nextCandidate ||
        !plan.policy.execution
          .allowFallback
      ) {
        break;
      }

      const lastFailure =
        failures[
          failures.length - 1
        ];

      if (lastFailure) {
        this.options.onFallback?.(
          candidate,
          nextCandidate,
          lastFailure.error,
        );
      }
    }

    throw this.createExecutionFailure(
      failures,
      totalAttempts,
    );
  }

  // ========================================================================
  // FAILURE
  // ========================================================================

  private createExecutionFailure(
    failures:
      readonly AIExecutionFailure[],
    totalAttempts: number,
  ): AIError {
    const lastFailure =
      failures[
        failures.length - 1
      ];

    if (!lastFailure) {
      return new AIError(
        [
          "AI execution failed because",
          "no executable provider was available.",
        ].join(" "),
        "UNAVAILABLE",
        {
          retryable: false,
        },
      );
    }

    const providerNames =
      failures.map(
        (failure) =>
          failure.provider,
      );

    const failureDetails =
      failures.map(
        (failure) => ({
          provider:
            failure.provider,

          runtime:
            failure.runtime,

          attempts:
            failure.attempts,

          code:
            failure.error.code,

          retryable:
            failure.error.retryable,

          message:
            failure.error.message,
        }),
      );

    return new AIError(
      [
        "AI execution failed after exhausting",
        "all eligible providers.",
        `Last provider: ${lastFailure.provider}.`,
        `Providers attempted: ${providerNames.join(", ")}.`,
      ].join(" "),
      lastFailure.error.code,
      {
        retryable:
          lastFailure.error.retryable,

        details: {
          provider:
            lastFailure.provider,

          runtime:
            lastFailure.runtime,

          details: {
            totalAttempts,

            providerCount:
              providerNames.length,

            failures:
              failureDetails,
          },
        },

        cause:
          lastFailure.error,
      },
    );
  }
}

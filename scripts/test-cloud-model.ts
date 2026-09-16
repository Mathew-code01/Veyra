
// ============================================================================
// FILE: scripts/test-cloud-model.ts
// PURPOSE:
// Production-oriented integration test for Veyra cloud AI.
//
// TEST PATH:
//
//   Environment
//       |
//       v
//   Default Cloud Provider Registry
//       |
//       v
//   CloudProvider
//       |
//       v
//   CloudGateway
//       |
//       v
//   CloudAIProvider
//       |
//       v
//   Real Cloud API
//
// This is intentionally an integration test rather than a unit test.
//
// It verifies that the complete cloud-model execution path is connected.
//
// USAGE:
//
//   npm run veyra:cloud:test
//
// Optional:
//
//   CLOUD_TEST_PROVIDER=gemini npm run veyra:cloud:test
//
//   CLOUD_TEST_PROVIDER=groq npm run veyra:cloud:test
//
//   CLOUD_TEST_PROVIDER=mistral npm run veyra:cloud:test
//
//   CLOUD_TEST_PROVIDER=cerebras npm run veyra:cloud:test
//
//   CLOUD_TEST_PROVIDER=openrouter npm run veyra:cloud:test
//
//   CLOUD_TEST_PROVIDER=huggingface npm run veyra:cloud:test
//
// ============================================================================

import { CloudAIProvider } from "../core/ai/CloudAIProvider";

import {
  createDefaultCloudProviderRegistry,
} from "../core/cloud/registry/defaultCloudProviders";

import type { AIRequest } from "../core/ai/AIRequest";

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly details?: string;
}

interface TestConfiguration {
  readonly providerId: string;
  readonly model?: string;
  readonly timeoutMs: number;
  readonly skipHealth: boolean;
  readonly skipStreaming: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 45_000;

const DEFAULT_TEST_PROMPT =
  "Reply with exactly: Veyra cloud integration test successful.";

// ============================================================================
// ENVIRONMENT
// ============================================================================

function getEnvironmentValue(
  name: string,
): string | undefined {
  const value = process.env[name];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return undefined;
  }

  return value.trim();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function getConfiguration(): TestConfiguration {
  return {
    providerId:
      getEnvironmentValue("CLOUD_TEST_PROVIDER") ??
      "gemini",

    model:
      getEnvironmentValue("CLOUD_TEST_MODEL"),

    timeoutMs:
      parsePositiveInteger(
        getEnvironmentValue("CLOUD_TEST_TIMEOUT_MS"),
        DEFAULT_TIMEOUT_MS,
      ),

    skipHealth:
      getEnvironmentValue("CLOUD_TEST_SKIP_HEALTH") === "true",

    skipStreaming:
      getEnvironmentValue("CLOUD_TEST_SKIP_STREAMING") === "true",
  };
}

// ============================================================================
// PARSING
// ============================================================================

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

// ============================================================================
// OUTPUT
// ============================================================================

function printHeader(): void {
  console.log("");
  console.log("============================================================");
  console.log(" Veyra Cloud AI Integration Test");
  console.log("============================================================");
  console.log("");
}

function printSection(
  title: string,
): void {
  console.log("");
  console.log(`--- ${title} ---`);
}

function printSuccess(
  message: string,
): void {
  console.log(`  ✓ ${message}`);
}

function printFailure(
  message: string,
): void {
  console.error(`  ✗ ${message}`);
}

function printInfo(
  message: string,
): void {
  console.log(`  • ${message}`);
}

// ============================================================================
// RESULT HELPERS
// ============================================================================

function createResult(
  name: string,
  startedAt: number,
  passed: boolean,
  details?: string,
): TestResult {
  return {
    name,
    passed,
    durationMs: Date.now() - startedAt,
    ...(details
      ? {
          details,
        }
      : {}),
  };
}

// ============================================================================
// REQUEST
// ============================================================================

function createTestRequest(
  model: string | undefined,
): AIRequest {
  const request = {
    type: "text_generation",

    ...(model
      ? {
          model,
        }
      : {}),

    messages: [
      {
        role: "system",
        content:
          "You are running an automated Veyra cloud integration test. Keep your response extremely short.",
      },

      {
        role: "user",
        content: DEFAULT_TEST_PROMPT,
      },
    ],

    options: {
      temperature: 0,
      maxOutputTokens: 32,
    },
  };

  return request as unknown as AIRequest;
}

// ============================================================================
// RESPONSE TEXT
// ============================================================================

function normalizeText(
  text: string,
): string {
  return text
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// PROVIDER DISCOVERY
// ============================================================================

function getCredentialEnvironmentVariable(
  providerId: string,
): string {
  switch (providerId) {
    case "gemini":
      return "GEMINI_API_KEY";

    case "groq":
      return "GROQ_API_KEY";

    case "cerebras":
      return "CEREBRAS_API_KEY";

    case "mistral":
      return "MISTRAL_API_KEY";

    case "openrouter":
      return "OPENROUTER_API_KEY";

    case "huggingface":
      return "HF_TOKEN";

    default:
      return "UNKNOWN";
  }
}

// ============================================================================
// MAIN TEST
// ============================================================================

async function main(): Promise<void> {
  printHeader();

  const configuration = getConfiguration();

  const results: TestResult[] = [];

  printSection("Configuration");

  printInfo(
    `Provider: ${configuration.providerId}`,
  );

  printInfo(
    `Model: ${configuration.model ?? "provider default"}`,
  );

  printInfo(
    `Timeout: ${configuration.timeoutMs}ms`,
  );

  printInfo(
    `Health check: ${
      configuration.skipHealth
        ? "skipped"
        : "enabled"
    }`,
  );

  printInfo(
    `Streaming: ${
      configuration.skipStreaming
        ? "skipped"
        : "enabled"
    }`,
  );

  // ==========================================================================
  // CREDENTIAL CHECK
  // ==========================================================================

  {
    const startedAt = Date.now();

    const environmentVariable =
      getCredentialEnvironmentVariable(
        configuration.providerId,
      );

    if (
      environmentVariable === "UNKNOWN"
    ) {
      printInfo(
        "Credential variable could not be determined for this provider.",
      );
    } else if (
      getEnvironmentValue(environmentVariable)
    ) {
      printSuccess(
        `Credential detected: ${environmentVariable}`,
      );
    } else {
      printFailure(
        `Missing credential: ${environmentVariable}`,
      );

      results.push(
        createResult(
          "Credential availability",
          startedAt,
          false,
          `Set ${environmentVariable} before running the test.`,
        ),
      );

      printSummary(results);

      process.exitCode = 1;

      return;
    }

    results.push(
      createResult(
        "Credential availability",
        startedAt,
        true,
      ),
    );
  }

  // ==========================================================================
  // REGISTRY
  // ==========================================================================

  printSection("Provider Registry");

  let registry:
    ReturnType<typeof createDefaultCloudProviderRegistry>;

  try {
    registry =
      createDefaultCloudProviderRegistry({
        allowUnconfigured: true,

        timeoutMs:
          configuration.timeoutMs,

        maxRetries: 2,

        applicationName: "Veyra Cloud Integration Test",
      });

    const provider =
      registry.tryGet(
        configuration.providerId,
      );

    if (!provider) {
      throw new Error(
        `Provider "${configuration.providerId}" is not registered.`,
      );
    }

    printSuccess(
      `Provider "${configuration.providerId}" is registered.`,
    );

    printInfo(
      `Provider name: ${provider.name}`,
    );

    printInfo(
      `Streaming: ${
        provider.capabilities.streaming
      }`,
    );

    printInfo(
      `Vision: ${
        provider.capabilities.vision
      }`,
    );

    printInfo(
      `Structured output: ${
        provider.capabilities.structuredOutput
      }`,
    );

    results.push(
      createResult(
        "Provider registration",
        Date.now(),
        true,
      ),
    );
  } catch (error) {
    const message =
      getErrorMessage(error);

    printFailure(
      `Provider registry failed: ${message}`,
    );

    results.push(
      createResult(
        "Provider registration",
        Date.now(),
        false,
        message,
      ),
    );

    printSummary(results);

    process.exitCode = 1;

    return;
  }

  // ==========================================================================
  // CLOUD AI PROVIDER
  // ==========================================================================

  const cloudProvider =
    new CloudAIProvider({
      providerId:
        configuration.providerId,

      registry,

      name:
        `test:cloud:${configuration.providerId}`,
    });

  // ==========================================================================
  // HEALTH
  // ==========================================================================

  if (!configuration.skipHealth) {
    printSection("Health Check");

    const startedAt = Date.now();

    try {
      const health =
        await cloudProvider.healthCheck();

      printInfo(
        `Status: ${health.status}`,
      );

      printInfo(
        `Latency: ${health.latencyMs}ms`,
      );

      if (health.error) {
        printInfo(
          `Health error: ${health.error}`,
        );
      }

      if (
        health.status === "healthy" ||
        health.status === "degraded"
      ) {
        printSuccess(
          `Cloud provider health check completed with status "${health.status}".`,
        );

        results.push(
          createResult(
            "Cloud health check",
            startedAt,
            true,
            health.status,
          ),
        );
      } else {
        printFailure(
          `Cloud provider is unavailable.`,
        );

        results.push(
          createResult(
            "Cloud health check",
            startedAt,
            false,
            health.error ??
              health.status,
          ),
        );
      }
    } catch (error) {
      const message =
        getErrorMessage(error);

      printFailure(
        `Health check failed: ${message}`,
      );

      results.push(
        createResult(
          "Cloud health check",
          startedAt,
          false,
          message,
        ),
      );
    }
  }

  // ==========================================================================
  // GENERATION
  // ==========================================================================

  printSection("Non-Streaming Generation");

  {
    const startedAt = Date.now();

    try {
      const request =
        createTestRequest(
          configuration.model,
        );

      const response =
        await withTimeout(
          cloudProvider.generate(
            request,
          ),
          configuration.timeoutMs,
        );

      const text =
        normalizeText(
          response.text,
        );

      if (!text) {
        throw new Error(
          "Cloud provider returned an empty response.",
        );
      }

      printSuccess(
        "Cloud generation succeeded.",
      );

      printInfo(
        `Response: ${text}`,
      );

      printInfo(
        `Model: ${
          response.metadata.model
        }`,
      );

      printInfo(
        `Request ID: ${
          response.metadata.requestId
        }`,
      );

      printInfo(
        `Latency: ${
          response.metadata.latencyMs
        }ms`,
      );

      const usage =
        response.metadata.usage;

      if (usage) {
        printInfo(
          `Usage: ${JSON.stringify(
            usage,
          )}`,
        );
      }

      results.push(
        createResult(
          "Cloud text generation",
          startedAt,
          true,
          `model=${response.metadata.model}`,
        ),
      );
    } catch (error) {
      const message =
        getErrorMessage(error);

      printFailure(
        `Cloud generation failed: ${message}`,
      );

      results.push(
        createResult(
          "Cloud text generation",
          startedAt,
          false,
          message,
        ),
      );
    }
  }

  // ==========================================================================
  // STREAMING
  // ==========================================================================

  if (
    !configuration.skipStreaming
  ) {
    printSection("Streaming Generation");

    const startedAt = Date.now();

    try {
      const provider =
        registry.tryGet(
          configuration.providerId,
        );

      if (!provider) {
        throw new Error(
          `Provider "${configuration.providerId}" is not registered.`,
        );
      }

      if (
        !provider.capabilities.streaming
      ) {
        printInfo(
          "Provider does not advertise streaming support. Skipping streaming test.",
        );

        results.push(
          createResult(
            "Cloud streaming",
            startedAt,
            true,
            "Provider does not support streaming.",
          ),
        );
      } else {
        const request =
          createTestRequest(
            configuration.model,
          );

        const stream =
          cloudProvider.stream(
            request,
          );

        let combinedText = "";

        let chunkCount = 0;

        let receivedDone = false;

        for await (
          const chunk of stream
        ) {
          chunkCount += 1;

          if (chunk.text) {
            combinedText += chunk.text;
          }

          if (chunk.done) {
            receivedDone = true;
          }
        }

        const normalized =
          normalizeText(
            combinedText,
          );

        if (!normalized) {
          throw new Error(
            "Streaming completed without receiving text.",
          );
        }

        printSuccess(
          "Cloud streaming succeeded.",
        );

        printInfo(
          `Chunks received: ${chunkCount}`,
        );

        printInfo(
          `Completed: ${receivedDone}`,
        );

        printInfo(
          `Response: ${normalized}`,
        );

        results.push(
          createResult(
            "Cloud streaming",
            startedAt,
            true,
            `${chunkCount} chunks`,
          ),
        );
      }
    } catch (error) {
      const message =
        getErrorMessage(error);

      printFailure(
        `Cloud streaming failed: ${message}`,
      );

      results.push(
        createResult(
          "Cloud streaming",
          startedAt,
          false,
          message,
        ),
      );
    }
  }

  // ==========================================================================
  // SUMMARY
  // ==========================================================================

  printSummary(results);

  const failed =
    results.filter(
      (result) => !result.passed,
    );

  process.exitCode =
    failed.length > 0 ? 1 : 0;
}

// ============================================================================
// TIMEOUT
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle:
    ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,

      new Promise<T>(
        (_, reject) => {
          timeoutHandle =
            setTimeout(() => {
              reject(
                new Error(
                  `Operation timed out after ${timeoutMs}ms.`,
                ),
              );
            }, timeoutMs);
        },
      ),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

// ============================================================================
// ERROR NORMALIZATION
// ============================================================================

function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "string"
  ) {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(
  results: readonly TestResult[],
): void {
  printSection("Test Summary");

  for (const result of results) {
    const symbol =
      result.passed
        ? "✓"
        : "✗";

    const duration =
      `${result.durationMs}ms`;

    console.log(
      `  ${symbol} ${result.name} (${duration})`,
    );

    if (result.details) {
      console.log(
        `      ${result.details}`,
      );
    }
  }

  const passed =
    results.filter(
      (result) => result.passed,
    ).length;

  const failed =
    results.filter(
      (result) => !result.passed,
    ).length;

  console.log("");
  console.log(
    `  Passed: ${passed}`,
  );

  console.log(
    `  Failed: ${failed}`,
  );

  console.log("");

  if (failed === 0) {
    console.log(
      "============================================================",
    );

    console.log(
      " CLOUD INTEGRATION TEST PASSED",
    );

    console.log(
      "============================================================",
    );
  } else {
    console.log(
      "============================================================",
    );

    console.log(
      " CLOUD INTEGRATION TEST FAILED",
    );

    console.log(
      "============================================================",
    );
  }

  console.log("");
}

// ============================================================================
// PROCESS ENTRYPOINT
// ============================================================================

main().catch((error: unknown) => {
  console.error("");
  console.error(
    "Fatal cloud integration test error:",
  );
  console.error(
    getErrorMessage(error),
  );
  console.error("");

  process.exitCode = 1;
});

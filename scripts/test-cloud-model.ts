// ============================================================================
// FILE: scripts/test-cloud-model.ts
// PURPOSE:
// Production-oriented integration test for Veyra cloud AI.
//
// DEFAULT BEHAVIOR:
// - Tests ALL registered providers.
// - Tests ALL catalog models.
// - Executes every model task that this harness can safely exercise.
// - Skips providers without credentials unless CLOUD_TEST_REQUIRE_ALL=true.
// - Uses Veyra's real CloudAIProvider execution path.
// - Never calls provider APIs directly from this test.
//
// EXECUTION PATH:
//
//   .env
//     |
//     v
//   Default Cloud Provider Registry
//     |
//     v
//   Cloud Provider
//     |
//     v
//   CloudAIProvider
//     |
//     v
//   Provider implementation
//     |
//     v
//   CloudHttpClient
//     |
//     v
//   Real cloud API
//
// ============================================================================

import "dotenv/config";

import { CloudAIProvider } from "../core/ai/CloudAIProvider";
import type { AIRequest } from "../core/ai/AIRequest";

import type { CloudCapabilities } from "../core/cloud/CloudCapabilities";
import type { CloudProvider } from "../core/cloud/CloudProvider";

import { createDefaultCloudProviderRegistry } from "../core/cloud/registry/defaultCloudProviders";

// ============================================================================
// TYPES
// ============================================================================

type TestStatus = "passed" | "failed" | "skipped";

type ModelTask =
  | "text_generation"
  | "vision"
  | "speech_to_text"
  | "text_to_speech"
  | "embedding"
  | "document_analysis";

interface TestResult {
  readonly name: string;
  readonly status: TestStatus;
  readonly durationMs: number;
  readonly details?: string;
}

interface TestConfiguration {
  /**
   * Optional provider filter.
   *
   * When omitted, every registered provider is tested.
   */
  readonly providerId?: string;

  /**
   * Optional model filter.
   *
   * When omitted, every applicable catalog model is tested.
   */
  readonly model?: string;

  /**
   * Per-operation timeout.
   */
  readonly timeoutMs: number;

  /**
   * Skip provider health checks.
   */
  readonly skipHealth: boolean;

  /**
   * Skip streaming tests.
   */
  readonly skipStreaming: boolean;

  /**
   * Missing credentials become failures instead of skips.
   */
  readonly requireAllCredentials: boolean;

  /**
   * Only execute text-generation models.
   */
  readonly textOnly: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_TIMEOUT_MS = 45_000;

const TEST_MAX_OUTPUT_TOKENS = 512;

const DEFAULT_TEST_PROMPT = [
  "This is an automated Veyra integration test.",
  "Do not explain anything.",
  "Return exactly:",
  "Veyra cloud integration test successful.",
].join(" ");

const EXPECTED_TEST_TEXT = "Veyra cloud integration test successful.";

// ============================================================================
// ENVIRONMENT
// ============================================================================

function getEnvironmentValue(name: string): string | undefined {
  const value = process.env[name];

  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return value.trim();
}

// ============================================================================
// CONFIGURATION
// ============================================================================

function getConfiguration(): TestConfiguration {
  return {
    providerId: getEnvironmentValue("CLOUD_TEST_PROVIDER"),

    model: getEnvironmentValue("CLOUD_TEST_MODEL"),

    timeoutMs: parsePositiveInteger(
      getEnvironmentValue("CLOUD_TEST_TIMEOUT_MS"),
      DEFAULT_TIMEOUT_MS,
    ),

    skipHealth: getEnvironmentValue("CLOUD_TEST_SKIP_HEALTH") === "true",

    skipStreaming: getEnvironmentValue("CLOUD_TEST_SKIP_STREAMING") === "true",

    requireAllCredentials:
      getEnvironmentValue("CLOUD_TEST_REQUIRE_ALL") === "true",

    textOnly: getEnvironmentValue("CLOUD_TEST_TEXT_ONLY") === "true",
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

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

// ============================================================================
// OUTPUT
// ============================================================================

function printHeader(): void {
  console.log("");
  console.log(
    "======================================================================",
  );
  console.log(" Veyra Cloud AI Integration Test");
  console.log(" Provider × Model Integration Matrix");
  console.log(
    "======================================================================",
  );
  console.log("");
}

function printSection(title: string): void {
  console.log("");
  console.log(`--- ${title} ---`);
}

function printProvider(providerId: string, providerName: string): void {
  console.log("");
  console.log(
    "######################################################################",
  );
  console.log(` PROVIDER: ${providerName} (${providerId})`);
  console.log(
    "######################################################################",
  );
}

function printModel(modelId: string): void {
  console.log("");
  console.log(`  MODEL: ${modelId}`);
  console.log(
    "  ------------------------------------------------------------------",
  );
}

function printSuccess(message: string): void {
  console.log(`    ✓ ${message}`);
}

function printFailure(message: string): void {
  console.error(`    ✗ ${message}`);
}

function printSkip(message: string): void {
  console.log(`    ○ ${message}`);
}

function printInfo(message: string): void {
  console.log(`    • ${message}`);
}

// ============================================================================
// RESULT HELPERS
// ============================================================================

function createResult(
  name: string,
  startedAt: number,
  status: TestStatus,
  details?: string,
): TestResult {
  return {
    name,
    status,
    durationMs: Date.now() - startedAt,
    ...(details
      ? {
          details,
        }
      : {}),
  };
}

// ============================================================================
// REQUESTS
// ============================================================================

function createTestRequest(model: string): AIRequest {
  return {
    type: "text_generation",
    model,
    messages: [
      {
        role: "user",
        content: DEFAULT_TEST_PROMPT,
      },
    ],
    options: {
      temperature: 0,
      maxOutputTokens: TEST_MAX_OUTPUT_TOKENS,
    },
  } as AIRequest;
}

/**
 * Embedding requests are kept separate from text generation.
 *
 * This prevents an embedding model from accidentally being sent to
 * a /chat/completions endpoint.
 */
function createEmbeddingTestRequest(model: string): AIRequest {
  return {
    type: "embedding",
    model,
    input: "Veyra cloud integration test embedding.",
  } as AIRequest;
}

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ============================================================================
// CREDENTIAL DISCOVERY
// ============================================================================

function getCredentialEnvironmentVariable(
  providerId: string,
): string | undefined {
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
      return undefined;
  }
}

// ============================================================================
// MODEL TASK DISCOVERY
// ============================================================================

function getModelTasks(
  model: unknown,
  capabilities: CloudCapabilities,
): readonly ModelTask[] {
  const candidate = model as {
    readonly tasks?: readonly unknown[];
    readonly task?: unknown;
    readonly type?: unknown;
  };

  const tasks: ModelTask[] = [];

  if (Array.isArray(candidate.tasks)) {
    for (const task of candidate.tasks) {
      if (isModelTask(task)) {
        tasks.push(task);
      }
    }
  }

  if (typeof candidate.task === "string" && isModelTask(candidate.task)) {
    tasks.push(candidate.task);
  }

  if (typeof candidate.type === "string" && isModelTask(candidate.type)) {
    tasks.push(candidate.type);
  }

  if (tasks.length > 0) {
    return uniqueTasks(tasks);
  }

  /**
   * Catalog fallback.
   *
   * Some Veyra catalogs may expose capability information only at the
   * provider level.
   */
  const fallback: ModelTask[] = [];

  if (capabilities.textGeneration) {
    fallback.push("text_generation");
  }

  if (capabilities.vision) {
    fallback.push("vision");
  }

  if (capabilities.speechToText) {
    fallback.push("speech_to_text");
  }

  if (capabilities.textToSpeech) {
    fallback.push("text_to_speech");
  }

  if (capabilities.embeddings) {
    fallback.push("embedding");
  }

  if (capabilities.documentAnalysis) {
    fallback.push("document_analysis");
  }

  return uniqueTasks(fallback);
}

function isModelTask(value: unknown): value is ModelTask {
  return (
    value === "text_generation" ||
    value === "vision" ||
    value === "speech_to_text" ||
    value === "text_to_speech" ||
    value === "embedding" ||
    value === "document_analysis"
  );
}

function uniqueTasks(tasks: readonly ModelTask[]): readonly ModelTask[] {
  return Array.from(new Set(tasks));
}

// ============================================================================
// MODEL ID
// ============================================================================

function getModelId(model: unknown): string {
  const candidate = model as {
    readonly modelId?: unknown;
    readonly id?: unknown;
    readonly name?: unknown;
  };

  if (typeof candidate.modelId === "string" && candidate.modelId.trim()) {
    return candidate.modelId.trim();
  }

  if (typeof candidate.id === "string" && candidate.id.trim()) {
    return candidate.id.trim();
  }

  if (typeof candidate.name === "string" && candidate.name.trim()) {
    return candidate.name.trim();
  }

  throw new Error("Cloud model does not expose a valid modelId, id, or name.");
}

// ============================================================================
// TASK EXECUTION
// ============================================================================

function getApplicableTasks(
  tasks: readonly ModelTask[],
  textOnly: boolean,
): readonly ModelTask[] {
  if (textOnly) {
    return tasks.includes("text_generation") ? ["text_generation"] : [];
  }

  /**
   * These tasks can currently be exercised without external binary
   * fixtures.
   *
   * Vision requires an image.
   * STT requires audio.
   * TTS requires audio-output validation.
   * Document analysis requires a document.
   */
  return tasks.filter(
    (task) => task === "text_generation" || task === "embedding",
  );
}

function getUnsupportedTaskReason(task: ModelTask): string {
  switch (task) {
    case "vision":
      return "Vision requires an image fixture; " + "none is configured.";

    case "speech_to_text":
      return (
        "Speech-to-text requires an audio fixture; " + "none is configured."
      );

    case "text_to_speech":
      return (
        "Text-to-speech requires output-audio validation; " +
        "no TTS fixture is configured."
      );

    case "document_analysis":
      return (
        "Document analysis requires a document fixture; " +
        "none is configured."
      );

    default:
      return `Task "${task}" is not executable by this harness.`;
  }
}

// ============================================================================
// PROVIDER CAPABILITY VALIDATION
// ============================================================================

function getProviderCapabilities(provider: CloudProvider): CloudCapabilities {
  return provider.capabilities;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  printHeader();

  const configuration = getConfiguration();

  const results: TestResult[] = [];

  // ========================================================================
  // CONFIGURATION
  // ========================================================================

  printSection("Configuration");

  printInfo(`Provider filter: ${configuration.providerId ?? "ALL PROVIDERS"}`);

  printInfo(`Model filter: ${configuration.model ?? "ALL MODELS"}`);

  printInfo(`Timeout: ${configuration.timeoutMs}ms`);

  printInfo(`Test max completion tokens: ${TEST_MAX_OUTPUT_TOKENS}`);

  printInfo(
    `Health checks: ${configuration.skipHealth ? "skipped" : "enabled"}`,
  );

  printInfo(
    `Streaming tests: ${configuration.skipStreaming ? "skipped" : "enabled"}`,
  );

  printInfo(
    `Require all credentials: ${
      configuration.requireAllCredentials ? "yes" : "no"
    }`,
  );

  printInfo(`Text-only mode: ${configuration.textOnly ? "yes" : "no"}`);

  printInfo(
    `Groq wire debug: ${
      getEnvironmentValue("GROQ_DEBUG_WIRE") === "true" ? "enabled" : "disabled"
    }`,
  );

  // ========================================================================
  // REGISTRY
  // ========================================================================

  printSection("Provider Registry");

  let registry: ReturnType<typeof createDefaultCloudProviderRegistry>;

  try {
    registry = createDefaultCloudProviderRegistry({
      allowUnconfigured: true,

      timeoutMs: configuration.timeoutMs,

      maxRetries: 2,

      applicationName: "Veyra Cloud Integration Test",

      applicationUrl: "https://mthw-dev.vercel.app",
    });

    printSuccess("Default cloud provider registry initialized.");
  } catch (error) {
    const message = getErrorMessage(error);

    printFailure(`Provider registry failed: ${message}`);

    results.push(
      createResult(
        "Provider registry initialization",
        Date.now(),
        "failed",
        message,
      ),
    );

    printSummary(results);

    process.exitCode = 1;

    return;
  }

  // ========================================================================
  // PROVIDER DISCOVERY
  // ========================================================================

  let providers: readonly CloudProvider[];

  try {
    providers = registry.list();
  } catch (error) {
    const message = getErrorMessage(error);

    printFailure(`Provider discovery failed: ${message}`);

    results.push(
      createResult("Provider discovery", Date.now(), "failed", message),
    );

    printSummary(results);

    process.exitCode = 1;

    return;
  }

  if (providers.length === 0) {
    printFailure("No cloud providers are registered.");

    results.push(
      createResult(
        "Provider discovery",
        Date.now(),
        "failed",
        "Registry returned zero providers.",
      ),
    );

    printSummary(results);

    process.exitCode = 1;

    return;
  }

  printSuccess(`Discovered ${providers.length} registered cloud provider(s).`);

  results.push(
    createResult(
      "Provider discovery",
      Date.now(),
      "passed",
      `${providers.length} provider(s)`,
    ),
  );

  // ========================================================================
  // PROVIDER LOOP
  // ========================================================================

  for (const provider of providers) {
    if (configuration.providerId && provider.id !== configuration.providerId) {
      continue;
    }

    printProvider(provider.id, provider.name);

    // ======================================================================
    // CREDENTIAL
    // ======================================================================

    const credentialEnvironmentVariable = getCredentialEnvironmentVariable(
      provider.id,
    );

    if (credentialEnvironmentVariable) {
      const credential = getEnvironmentValue(credentialEnvironmentVariable);

      if (credential) {
        printSuccess(`Credential detected: ${credentialEnvironmentVariable}`);

        results.push(
          createResult(
            `${provider.id} credential availability`,
            Date.now(),
            "passed",
          ),
        );
      } else {
        const reason = `Missing ${credentialEnvironmentVariable}.`;

        if (configuration.requireAllCredentials) {
          printFailure(`${reason} CLOUD_TEST_REQUIRE_ALL=true.`);

          results.push(
            createResult(
              `${provider.id} credential availability`,
              Date.now(),
              "failed",
              reason,
            ),
          );
        } else {
          printSkip(`${reason} Provider will not execute.`);

          results.push(
            createResult(
              `${provider.id} credential availability`,
              Date.now(),
              "skipped",
              reason,
            ),
          );
        }

        continue;
      }
    }

    // ======================================================================
    // CAPABILITIES
    // ======================================================================

    const capabilities = getProviderCapabilities(provider);

    printSection(`${provider.name} Capabilities`);

    printInfo(`Provider ID: ${provider.id}`);

    printInfo(`Text generation: ${capabilities.textGeneration}`);

    printInfo(`Streaming: ${capabilities.streaming}`);

    printInfo(`Vision: ${capabilities.vision}`);

    printInfo(`Speech-to-text: ${capabilities.speechToText}`);

    printInfo(`Text-to-speech: ${capabilities.textToSpeech}`);

    printInfo(`Embeddings: ${capabilities.embeddings}`);

    printInfo(`Document analysis: ${capabilities.documentAnalysis}`);

    printInfo(`Structured output: ${capabilities.structuredOutput}`);

    printInfo(`Tool calling: ${capabilities.toolCalling}`);

    // ======================================================================
    // CLOUD AI PROVIDER
    // ======================================================================

    let cloudProvider: CloudAIProvider;

    try {
      cloudProvider = new CloudAIProvider({
        providerId: provider.id,

        registry,

        name: `test:cloud:${provider.id}`,
      });
    } catch (error) {
      const message = getErrorMessage(error);

      printFailure(`CloudAIProvider initialization failed: ${message}`);

      results.push(
        createResult(
          `${provider.id} CloudAIProvider initialization`,
          Date.now(),
          "failed",
          message,
        ),
      );

      continue;
    }

    printSuccess("CloudAIProvider initialized.");

    // ======================================================================
    // HEALTH
    // ======================================================================

    if (!configuration.skipHealth) {
      printSection(`${provider.name} Health Check`);

      const startedAt = Date.now();

      try {
        const health = await withTimeout(
          cloudProvider.healthCheck(),
          configuration.timeoutMs,
        );

        printInfo(`Status: ${health.status}`);

        printInfo(`Latency: ${health.latencyMs}ms`);

        if (health.error) {
          printInfo(`Health error: ${health.error}`);
        }

        if (health.status === "healthy" || health.status === "degraded") {
          printSuccess(
            `Health check completed with status "${health.status}".`,
          );

          results.push(
            createResult(
              `${provider.id} health check`,
              startedAt,
              "passed",
              health.status,
            ),
          );
        } else {
          printFailure("Cloud provider is unavailable.");

          results.push(
            createResult(
              `${provider.id} health check`,
              startedAt,
              "failed",
              health.error ?? health.status,
            ),
          );
        }
      } catch (error) {
        const message = getErrorMessage(error);

        printFailure(`Health check failed: ${message}`);

        results.push(
          createResult(
            `${provider.id} health check`,
            startedAt,
            "failed",
            message,
          ),
        );
      }
    } else {
      printSkip("Health check skipped by configuration.");

      results.push(
        createResult(
          `${provider.id} health check`,
          Date.now(),
          "skipped",
          "CLOUD_TEST_SKIP_HEALTH=true",
        ),
      );
    }

    // ======================================================================
    // MODEL CATALOG
    // ======================================================================

    const models = Array.from(provider.models);

    if (models.length === 0) {
      printSkip("Provider exposes no models in its Veyra model catalog.");

      results.push(
        createResult(
          `${provider.id} model discovery`,
          Date.now(),
          "skipped",
          "No catalog models.",
        ),
      );

      continue;
    }

    printSection(`${provider.name} Model Catalog`);

    printInfo(`Catalog models: ${models.length}`);

    // ======================================================================
    // MODEL LOOP
    // ======================================================================

    for (const rawModel of models) {
      let modelId: string;

      try {
        modelId = getModelId(rawModel);
      } catch (error) {
        const message = getErrorMessage(error);

        printFailure(`Invalid model catalog entry: ${message}`);

        results.push(
          createResult(
            `${provider.id} invalid model catalog entry`,
            Date.now(),
            "failed",
            message,
          ),
        );

        continue;
      }

      if (configuration.model && modelId !== configuration.model) {
        continue;
      }

      printModel(modelId);

      const tasks = getModelTasks(rawModel, capabilities);

      printInfo(
        `Catalog tasks: ${tasks.length > 0 ? tasks.join(", ") : "none"}`,
      );

      const applicableTasks = getApplicableTasks(tasks, configuration.textOnly);

      // ====================================================================
      // UNSUPPORTED MODALITIES
      // ====================================================================

      for (const task of tasks) {
        if (!applicableTasks.includes(task)) {
          const reason = getUnsupportedTaskReason(task);

          printSkip(`${task}: ${reason}`);

          results.push(
            createResult(
              `${provider.id}/${modelId} ${task}`,
              Date.now(),
              "skipped",
              reason,
            ),
          );
        }
      }

      // ====================================================================
      // NO EXECUTABLE TASK
      // ====================================================================

      if (applicableTasks.length === 0) {
        if (tasks.length === 0) {
          printSkip("Model has no executable task metadata.");

          results.push(
            createResult(
              `${provider.id}/${modelId} model execution`,
              Date.now(),
              "skipped",
              "No executable task metadata.",
            ),
          );
        }

        continue;
      }

      // ====================================================================
      // TASK LOOP
      // ====================================================================

      for (const task of applicableTasks) {
        switch (task) {
          case "text_generation":
            await testTextGenerationModel({
              provider,
              cloudProvider,
              modelId,
              configuration,
              results,
            });
            break;

          case "embedding":
            await testEmbeddingModel({
              provider,
              cloudProvider,
              modelId,
              configuration,
              results,
            });
            break;

          default:
            break;
        }
      }
    }
  }

  // ========================================================================
  // SUMMARY
  // ========================================================================

  printSummary(results);

  const failed = results.filter((result) => result.status === "failed");

  process.exitCode = failed.length > 0 ? 1 : 0;
}

// ============================================================================
// TEXT GENERATION TEST
// ============================================================================

async function testTextGenerationModel({
  provider,
  cloudProvider,
  modelId,
  configuration,
  results,
}: {
  readonly provider: CloudProvider;
  readonly cloudProvider: CloudAIProvider;
  readonly modelId: string;
  readonly configuration: TestConfiguration;
  readonly results: TestResult[];
}): Promise<void> {
  // ========================================================================
  // NON-STREAMING
  // ========================================================================

  printSection(`${provider.id}/${modelId} — Non-Streaming Generation`);

  {
    const startedAt = Date.now();

    try {
      const request = createTestRequest(modelId);

      const response = await withTimeout(
        cloudProvider.generate(request),
        configuration.timeoutMs,
      );

      const text = normalizeText(response.text);

      if (!text) {
        throw new Error("Cloud provider returned an empty response.");
      }

      printSuccess("Cloud generation succeeded.");

      printInfo(`Response: ${text}`);

      printInfo(`Model: ${response.metadata.model}`);

      printInfo(`Request ID: ${response.metadata.requestId}`);

      printInfo(`Latency: ${response.metadata.latencyMs}ms`);

      if (response.metadata.usage) {
        printInfo(`Usage: ${JSON.stringify(response.metadata.usage)}`);
      }

      if (!text.toLowerCase().includes(EXPECTED_TEST_TEXT.toLowerCase())) {
        printInfo(
          "Provider returned valid non-empty output, but did not reproduce the exact smoke-test sentence.",
        );
      }

      results.push(
        createResult(
          `${provider.id}/${modelId} text generation`,
          startedAt,
          "passed",
          `model=${response.metadata.model}`,
        ),
      );
    } catch (error) {
      const message = getErrorMessage(error);

      printFailure(`Cloud generation failed: ${message}`);

      results.push(
        createResult(
          `${provider.id}/${modelId} text generation`,
          startedAt,
          "failed",
          message,
        ),
      );
    }
  }

  // ========================================================================
  // STREAMING
  // ========================================================================

  if (configuration.skipStreaming) {
    printSkip("Streaming test skipped by configuration.");

    results.push(
      createResult(
        `${provider.id}/${modelId} streaming`,
        Date.now(),
        "skipped",
        "CLOUD_TEST_SKIP_STREAMING=true",
      ),
    );

    return;
  }

  if (!provider.capabilities.streaming) {
    printSkip("Provider does not advertise streaming support.");

    results.push(
      createResult(
        `${provider.id}/${modelId} streaming`,
        Date.now(),
        "skipped",
        "Provider capability streaming=false.",
      ),
    );

    return;
  }

  printSection(`${provider.id}/${modelId} — Streaming Generation`);

  {
    const startedAt = Date.now();

    try {
      const request = createTestRequest(modelId);

      /**
       * stream() is intentionally synchronous.
       *
       * The provider implementation is responsible for lazy HTTP
       * initialization.
       */
      const stream = cloudProvider.stream(request);

      let combinedText = "";

      let chunkCount = 0;

      let receivedDone = false;

      for await (const chunk of stream) {
        chunkCount += 1;

        if (typeof chunk.text === "string") {
          combinedText += chunk.text;
        }

        if (chunk.done) {
          receivedDone = true;
        }
      }

      const normalized = normalizeText(combinedText);

      if (!normalized) {
        throw new Error("Streaming completed without receiving text.");
      }

      printSuccess("Cloud streaming succeeded.");

      printInfo(`Chunks received: ${chunkCount}`);

      printInfo(`Completed: ${receivedDone}`);

      printInfo(`Response: ${normalized}`);

      results.push(
        createResult(
          `${provider.id}/${modelId} streaming`,
          startedAt,
          "passed",
          `${chunkCount} chunks`,
        ),
      );
    } catch (error) {
      const message = getErrorMessage(error);

      printFailure(`Cloud streaming failed: ${message}`);

      results.push(
        createResult(
          `${provider.id}/${modelId} streaming`,
          startedAt,
          "failed",
          message,
        ),
      );
    }
  }
}

// ============================================================================
// EMBEDDING MODEL TEST
// ============================================================================

async function testEmbeddingModel({
  provider,
  cloudProvider,
  modelId,
  configuration,
  results,
}: {
  readonly provider: CloudProvider;
  readonly cloudProvider: CloudAIProvider;
  readonly modelId: string;
  readonly configuration: TestConfiguration;
  readonly results: TestResult[];
}): Promise<void> {
  printSection(`${provider.id}/${modelId} — Embedding`);

  if (!provider.capabilities.embeddings) {
    printSkip("Provider does not advertise embedding support.");

    results.push(
      createResult(
        `${provider.id}/${modelId} embedding`,
        Date.now(),
        "skipped",
        "Provider capability embeddings=false.",
      ),
    );

    return;
  }

  const startedAt = Date.now();

  try {
    const request = createEmbeddingTestRequest(modelId);

    /**
     * Use the Veyra CloudAIProvider execution path.
     *
     * No direct Mistral/OpenAI-compatible fetch is performed here.
     */
    const response = await withTimeout(
      cloudProvider.generate(request),
      configuration.timeoutMs,
    );

    if (response === undefined || response === null) {
      throw new Error("Embedding provider returned no response.");
    }

    const candidate = response as unknown as {
      readonly embeddings?: unknown;
      readonly data?: unknown;
      readonly metadata?: {
        readonly model?: string;
      };
    };

    const hasEmbeddingPayload =
      Array.isArray(candidate.embeddings) || Array.isArray(candidate.data);

    if (!hasEmbeddingPayload) {
      throw new Error(
        "Embedding provider returned a response without an embeddings/data array.",
      );
    }

    printSuccess("Embedding request succeeded.");

    if (candidate.metadata?.model) {
      printInfo(`Model: ${candidate.metadata.model}`);
    }

    results.push(
      createResult(
        `${provider.id}/${modelId} embedding`,
        startedAt,
        "passed",
        `model=${modelId}`,
      ),
    );
  } catch (error) {
    const message = getErrorMessage(error);

    printFailure(`Embedding test failed: ${message}`);

    results.push(
      createResult(
        `${provider.id}/${modelId} embedding`,
        startedAt,
        "failed",
        message,
      ),
    );
  }
}

// ============================================================================
// TIMEOUT
// ============================================================================

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,

      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
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

function printSummary(results: readonly TestResult[]): void {
  printSection("Test Summary");

  if (results.length === 0) {
    console.log("  No tests were executed.");

    console.log("");

    return;
  }

  for (const result of results) {
    const symbol =
      result.status === "passed" ? "✓" : result.status === "failed" ? "✗" : "○";

    console.log(`  ${symbol} ${result.name} (${result.durationMs}ms)`);

    if (result.details) {
      console.log(`      ${result.details}`);
    }
  }

  const passed = results.filter((result) => result.status === "passed").length;

  const failed = results.filter((result) => result.status === "failed").length;

  const skipped = results.filter(
    (result) => result.status === "skipped",
  ).length;

  console.log("");

  console.log(`  Passed:  ${passed}`);

  console.log(`  Failed:  ${failed}`);

  console.log(`  Skipped: ${skipped}`);

  console.log(`  Total:   ${results.length}`);

  console.log("");

  if (failed === 0) {
    console.log(
      "======================================================================",
    );

    console.log(" CLOUD INTEGRATION TEST PASSED");

    console.log(
      "======================================================================",
    );
  } else {
    console.log(
      "======================================================================",
    );

    console.log(" CLOUD INTEGRATION TEST FAILED");

    console.log(
      "======================================================================",
    );
  }

  console.log("");
}

// ============================================================================
// PROCESS ENTRYPOINT
// ============================================================================

main().catch((error: unknown) => {
  console.error("");

  console.error("Fatal cloud integration test error:");

  console.error(getErrorMessage(error));

  console.error("");

  process.exitCode = 1;
});

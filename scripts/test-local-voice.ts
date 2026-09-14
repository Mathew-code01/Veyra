/**
 * ============================================================================
 * Veyra — Local Voice Integration Test
 * ============================================================================
 *
 * Tests REAL local voice processing:
 *
 *   Whisper.cpp
 *       speech WAV
 *          ↓
 *       REAL STT
 *          ↓
 *       transcript
 *
 *   Kokoro
 *       text
 *          ↓
 *       REAL TTS
 *          ↓
 *       generated WAV
 *
 *   Optional round trip:
 *
 *       generated WAV
 *          ↓
 *       Whisper.cpp
 *          ↓
 *       transcript
 *
 * Nothing in this test is mocked.
 *
 * The test:
 *
 *  1. Detects local Veyra storage.
 *  2. Resolves Whisper and Kokoro models.
 *  3. Installs/reuses whisper.cpp.
 *  4. Installs/reuses Whisper model.
 *  5. Verifies Whisper artifacts.
 *  6. Loads Whisper.
 *  7. Performs REAL speech-to-text.
 *  8. Unloads Whisper.
 *  9. Installs/reuses Kokoro model.
 * 10. Verifies Kokoro package.
 * 11. Loads Kokoro.
 * 12. Performs REAL text-to-speech.
 * 13. Validates the generated WAV.
 * 14. Unloads Kokoro.
 * 15. Optionally reloads Whisper.
 * 16. Performs REAL TTS → STT round-trip.
 * 17. Cleans up temporary test output.
 *
 * Environment:
 *
 *   VEYRA_MODEL_DATA_DIR
 *   VEYRA_VOICE_TEST_AUDIO
 *   VEYRA_VOICE_TEST_TEXT
 *   VEYRA_VOICE_TEST_VOICE
 *   VEYRA_VOICE_TEST_LANGUAGE
 *   VEYRA_VOICE_TEST_THREADS
 *   VEYRA_VOICE_TEST_KEEP_OUTPUT
 *   VEYRA_VOICE_TEST_ROUND_TRIP
 *   VEYRA_VOICE_TEST_TIMEOUT_MS
 *
 * Example:
 *
 *   $env:VEYRA_VOICE_TEST_AUDIO="C:\Users\MATTHEW\Music\test.wav"
 *   npm run veyra:voice:test
 *
 * ============================================================================
 */

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ModelDefinition } from "../core/models/ModelRegistry";

import { defaultModelRegistry } from "../core/models/ModelRegistry";

import { ModelPaths } from "../core/models/storage/ModelPaths";

import { ModelStorage } from "../core/models/storage/ModelStorage";

import { ModelDownloadQueue } from "../core/models/installation/ModelDownloadQueue";

import { ModelInstallationManager } from "../core/models/installation/ModelInstallationManager";

import { ModelManager } from "../core/models/ModelManager";

import { ModelRuntimeManager } from "../core/models/runtime/ModelRuntimeManager";

import { RuntimeInstaller } from "../core/models/runtime/RuntimeInstaller";

import { RuntimeRegistry } from "../core/models/runtime/RuntimeRegistry";

import { WhisperCppRuntime } from "../core/models/runtime/WhisperCppRuntime";

import { KokoroRuntime } from "../core/models/runtime/KokoroRuntime";
import { KokoroPackageInstaller } from "../core/models/installation/KokoroPackageInstaller";
/**
 * ============================================================================
 * Configuration
 * ============================================================================
 */

const APPLICATION_NAME = "Veyra";

const DEFAULT_WHISPER_MODEL_ID = "whisper-cpp-tiny";

const DEFAULT_KOKORO_MODEL_ID = "kokoro-82m";

const DEFAULT_LANGUAGE = "en";

const DEFAULT_THREADS = 2;

const DEFAULT_VOICE = "af_heart";

const DEFAULT_TEST_TEXT =
  "Veyra local voice test. This speech was generated locally on the computer.";

const DEFAULT_TIMEOUT_MS = 120_000;

const MODEL_ROOT =
  process.env.VEYRA_MODEL_DATA_DIR?.trim() ||
  path.join(os.homedir(), "AppData", "Local", APPLICATION_NAME);

const VOICE_TEST_AUDIO = process.env.VEYRA_VOICE_TEST_AUDIO?.trim() || "";

const TEST_LANGUAGE =
  process.env.VEYRA_VOICE_TEST_LANGUAGE?.trim() || DEFAULT_LANGUAGE;

const TEST_THREADS = parsePositiveInteger(
  process.env.VEYRA_VOICE_TEST_THREADS,
  DEFAULT_THREADS,
);

const TEST_VOICE = process.env.VEYRA_VOICE_TEST_VOICE?.trim() || DEFAULT_VOICE;

const TEST_TEXT =
  process.env.VEYRA_VOICE_TEST_TEXT?.trim() || DEFAULT_TEST_TEXT;

const KEEP_OUTPUT = parseBoolean(process.env.VEYRA_VOICE_TEST_KEEP_OUTPUT);

const RUN_ROUND_TRIP = parseBoolean(
  process.env.VEYRA_VOICE_TEST_ROUND_TRIP,
  true,
);

const TEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.VEYRA_VOICE_TEST_TIMEOUT_MS,
  DEFAULT_TIMEOUT_MS,
);

/**
 * ============================================================================
 * Types
 * ============================================================================
 */

interface TestContext {
  readonly paths: ModelPaths;

  readonly storage: ModelStorage;

  readonly queue: ModelDownloadQueue;

  readonly installationManager: ModelInstallationManager;

  readonly runtimeInstaller: RuntimeInstaller;

  readonly runtimeRegistry: RuntimeRegistry;

  readonly runtimeManager: ModelRuntimeManager;

  readonly modelManager: ModelManager;

  readonly whisperModel: ModelDefinition;

  readonly kokoroModel: ModelDefinition;

  readonly temporaryDirectory: string;

  readonly generatedAudioPath: string;

  readonly roundTripAudioPath: string;
}

interface TestResult {
  readonly name: string;

  readonly durationMs: number;
}

interface WavInfo {
  readonly filePath: string;

  readonly fileSizeBytes: number;

  readonly audioFormat: number;

  readonly channels: number;

  readonly sampleRate: number;

  readonly bitsPerSample: number;

  readonly dataBytes: number;

  readonly durationSeconds: number;
}

/**
 * ============================================================================
 * Main
 * ============================================================================
 */

async function main(): Promise<void> {
  const startedAt = Date.now();

  printHeader();

  printConfiguration();

  const results: TestResult[] = [];

  let context: TestContext | null = null;

  let whisperRuntime: WhisperCppRuntime | null = null;

  let kokoroRuntime: KokoroRuntime | null = null;

  try {
    /**
     * ------------------------------------------------------------------------
     * Stage 01 — Environment
     * ------------------------------------------------------------------------
     */

    await runStage(results, "01", "Validate environment", async () => {
      await validateEnvironment();
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 02 — Build Veyra services
     * ------------------------------------------------------------------------
     */

    context = await runStage(
      results,
      "02",
      "Initialize Veyra model services",
      async () => {
        return createContext();
      },
    );

    /**
     * ------------------------------------------------------------------------
     * Stage 03 — Resolve models
     * ------------------------------------------------------------------------
     */

    await runStage(results, "03", "Resolve voice models", async () => {
      assertModelSupport(context!, context!.whisperModel, "Whisper");

      assertModelSupport(context!, context!.kokoroModel, "Kokoro");

      printModelInfo(context!.whisperModel);

      printModelInfo(context!.kokoroModel);
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 04 — Install/reuse whisper.cpp
     * ------------------------------------------------------------------------
     */

    let whisperExecutablePath = "";

    await runStage(
      results,
      "04",
      "Install/reuse whisper.cpp runtime",
      async () => {
        const installResult =
          await context!.runtimeInstaller.ensureWhisperCpp();

        printSuccess(`Whisper runtime ready: ${installResult.version}`);

        printInfo(`Runtime directory: ${installResult.runtimeDirectory}`);

        whisperExecutablePath = await locateWhisperExecutable(
          installResult.runtimeDirectory,
        );

        printSuccess(`whisper-cli: ${whisperExecutablePath}`);
      },
    );

    /**
     * ------------------------------------------------------------------------
     * Stage 05 — Register Whisper runtime
     * ------------------------------------------------------------------------
     */

    await runStage(results, "05", "Register Whisper runtime", async () => {
      whisperRuntime = new WhisperCppRuntime({
        executablePath: whisperExecutablePath,

        defaultThreads: TEST_THREADS,

        startupTimeoutMs: 15_000,

        shutdownTimeoutMs: 3_000,
      });

      context!.runtimeManager.registerRuntimeFactory(
        "whisper_cpp",
        () => whisperRuntime!,
      );

      printSuccess("whisper_cpp runtime registered.");
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 06 — Install/reuse Whisper model
     * ------------------------------------------------------------------------
     */

    await runStage(results, "06", "Install/reuse Whisper model", async () => {
      await context!.modelManager.ensureInstalled(context!.whisperModel.id);

      const stored = await context!.storage.getStoredModel(
        context!.whisperModel,
      );

      if (!stored) {
        throw new Error(
          `Whisper model "${context!.whisperModel.id}" ` +
            "is not registered as installed.",
        );
      }

      printSuccess(`Whisper model ready: ${context!.whisperModel.displayName}`);

      printInfo(`Model artifact: ${stored.artifactPath}`);
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 07 — Verify Whisper installation
     * ------------------------------------------------------------------------
     */

    await runStage(
      results,
      "07",
      "Verify Whisper model integrity",
      async () => {
        const stored = await context!.storage.getStoredModel(
          context!.whisperModel,
        );

        if (!stored) {
          throw new Error("Whisper model storage record is missing.");
        }

        await assertReadableFile(stored.artifactPath, "Whisper model artifact");

        const stat = await fs.stat(stored.artifactPath);

        if (stat.size <= 0) {
          throw new Error("Whisper model artifact is empty.");
        }

        printSuccess(`Whisper artifact verified: ${formatBytes(stat.size)}`);
      },
    );

    /**
     * ------------------------------------------------------------------------
     * Stage 08 — Validate input WAV
     * ------------------------------------------------------------------------
     */

    let sourceWav: WavInfo | null = null;

    await runStage(results, "08", "Validate speech WAV input", async () => {
      sourceWav = await validateSpeechInputAudio(VOICE_TEST_AUDIO);

      printSuccess(`Input WAV: ${formatBytes(sourceWav.fileSizeBytes)}`);

      printInfo(
        `Format: ${sourceWav.sampleRate} Hz / ` +
          `${sourceWav.channels} channel(s) / ` +
          `${sourceWav.bitsPerSample}-bit`,
      );

      printInfo(`Duration: ${sourceWav.durationSeconds.toFixed(2)} seconds`);
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 09 — Load Whisper
     * ------------------------------------------------------------------------
     */

    await runStage(results, "09", "Load Whisper model", async () => {
      await context!.modelManager.ensureLoaded(context!.whisperModel.id);

      const health = await whisperRuntime!.health();

      if (!health.ready) {
        throw new Error("Whisper runtime reported not-ready after loading.");
      }

      if (health.loadedModelId !== context!.whisperModel.id) {
        throw new Error(
          `Whisper loaded model mismatch. Expected ` +
            `"${context!.whisperModel.id}", got ` +
            `"${health.loadedModelId}".`,
        );
      }

      printSuccess("Whisper model loaded into the local runtime.");
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 10 — REAL speech-to-text
     * ------------------------------------------------------------------------
     */

    let sourceTranscript = "";

    await runStage(results, "10", "Run REAL speech-to-text", async () => {
      const result = await context!.modelManager.transcribe({
        audioFilePath: sourceWav!.filePath,

        language: TEST_LANGUAGE,

        threads: TEST_THREADS,
      });

      sourceTranscript = result.text.trim();

      if (!sourceTranscript) {
        throw new Error(
          "Whisper completed successfully but returned an empty transcript.",
        );
      }

      printSuccess(`REAL STT completed in ${result.durationMs} ms.`);

      printTranscript("Recognized speech", sourceTranscript);
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 11 — Unload Whisper
     * ------------------------------------------------------------------------
     */

    await runStage(results, "11", "Unload Whisper before TTS", async () => {
      await context!.runtimeManager.unload();

      const health = await whisperRuntime!.health();

      if (health.ready) {
        throw new Error("Whisper runtime still reports ready after unload.");
      }

      printSuccess("Whisper runtime unloaded.");
    });

    
/**
 * ------------------------------------------------------------------------
 * Stage 12 — Install/reuse Kokoro package
 * ------------------------------------------------------------------------
 *
 * The generic ModelInstallationManager installs/registers the Veyra model.
 *
 * Kokoro additionally requires its complete Transformers.js package layout:
 *
 *   config.json
 *   tokenizer.json
 *   tokenizer_config.json
 *   onnx/model_fp16.onnx
 *   voices/af_heart.bin
 *
 * KokoroPackageInstaller is responsible for completing and verifying that
 * package.
 * ------------------------------------------------------------------------
 */

await runStage(
  results,
  "12",
  "Install/reuse Kokoro model",
  async () => {
    /**
     * ----------------------------------------------------------------------
     * 1. Install/register the model through the normal Veyra pipeline.
     * ----------------------------------------------------------------------
     */

    await context!.modelManager.ensureInstalled(
      context!.kokoroModel.id,
    );

    /**
     * ----------------------------------------------------------------------
     * 2. Retrieve the actual Veyra storage record.
     * ----------------------------------------------------------------------
     *
     * IMPORTANT:
     *
     * This must happen BEFORE using `stored`.
     * ----------------------------------------------------------------------
     */

    const stored =
      await context!.storage.getStoredModel(
        context!.kokoroModel,
      );

    if (!stored) {
      throw new Error(
        `Kokoro model "${context!.kokoroModel.id}" ` +
          "is not registered as installed.",
      );
    }

    /**
     * ----------------------------------------------------------------------
     * 3. Resolve the model directory.
     * ----------------------------------------------------------------------
     */

    const kokoroModelDirectory =
      context!.storage.getModelDirectory(
        context!.kokoroModel,
      );

    /**
     * ----------------------------------------------------------------------
     * 4. Complete the Kokoro package.
     * ----------------------------------------------------------------------
     *
     * The installer downloads only the missing/invalid Kokoro-specific
     * assets and verifies them.
     *
     * No fake success is possible here.
     * ----------------------------------------------------------------------
     */

    const kokoroPackageInstaller =
      new KokoroPackageInstaller();

    const packageResult =
      await kokoroPackageInstaller.install({
        modelDirectory:
          kokoroModelDirectory,

        modelArtifactPath:
          stored.artifactPath,

        voice:
          TEST_VOICE,
      });

    /**
     * ----------------------------------------------------------------------
     * 5. Report the resulting package.
     * ----------------------------------------------------------------------
     */

    printSuccess(
      `Kokoro package ready: ${context!.kokoroModel.displayName}`,
    );

    printInfo(
      `Model directory: ${packageResult.modelDirectory}`,
    );

    printInfo(
      `Primary artifact: ${packageResult.modelPath}`,
    );

    printInfo(
      `Voice: ${packageResult.voice}`,
    );

    printInfo(
      `Voice artifact: ${packageResult.voicePath}`,
    );

    printInfo(
      `Downloaded this run: ${formatBytes(
        packageResult.downloadedBytes,
      )}`,
    );

    printInfo(
      `Package tracked size: ${formatBytes(
        packageResult.totalBytes,
      )}`,
    );

    if (
      packageResult.downloadedFiles.length > 0
    ) {
      printInfo(
        `Downloaded files: ${packageResult.downloadedFiles.join(
          ", ",
        )}`,
      );
    } else {
      printInfo(
        "Downloaded files: none — existing verified package reused.",
      );
    }

    if (
      packageResult.reusedFiles.length > 0
    ) {
      printInfo(
        `Reused files: ${packageResult.reusedFiles.join(
          ", ",
        )}`,
      );
    }
  },
);


    /**
     * ------------------------------------------------------------------------
     * Stage 13 — Verify Kokoro package
     * ------------------------------------------------------------------------
     */

    await runStage(results, "13", "Verify Kokoro package", async () => {
      await verifyKokoroPackage(context!.kokoroModel, context!.storage);
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 14 — Register Kokoro runtime
     * ------------------------------------------------------------------------
     */

    await runStage(results, "14", "Register Kokoro runtime", async () => {
      kokoroRuntime = new KokoroRuntime({
        dtype: "q8",

        device: "cpu",
      });

      context!.runtimeManager.registerRuntimeFactory(
        "kokoro",
        () => kokoroRuntime!,
      );

      printSuccess("kokoro runtime registered.");
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 15 — Load Kokoro
     * ------------------------------------------------------------------------
     */

    await runStage(results, "15", "Load Kokoro model", async () => {
      await context!.modelManager.ensureLoaded(context!.kokoroModel.id);

      const health = await kokoroRuntime!.health();

      if (!health.ready) {
        throw new Error("Kokoro runtime reported not-ready after loading.");
      }

      if (health.loadedModelId !== context!.kokoroModel.id) {
        throw new Error(
          `Kokoro loaded model mismatch. Expected ` +
            `"${context!.kokoroModel.id}", got ` +
            `"${health.loadedModelId}".`,
        );
      }

      printSuccess("Kokoro model loaded locally.");
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 16 — REAL text-to-speech
     * ------------------------------------------------------------------------
     */

    let generatedWav: WavInfo | null = null;

    await runStage(results, "16", "Run REAL text-to-speech", async () => {
      const result = await context!.modelManager.synthesize({
        text: TEST_TEXT,

        voice: TEST_VOICE,

        speed: 1,

        outputFilePath: context!.generatedAudioPath,
      });

      printSuccess(`REAL TTS completed in ${result.durationMs} ms.`);

      printInfo(`Voice: ${result.voice}`);

      printInfo(`Output: ${result.audioFilePath}`);

      generatedWav = await validateGeneratedWav(result.audioFilePath);

      printSuccess(`Generated WAV: ${formatBytes(generatedWav.fileSizeBytes)}`);

      printInfo(
        `Audio duration: ${generatedWav.durationSeconds.toFixed(2)} seconds`,
      );
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 17 — Unload Kokoro
     * ------------------------------------------------------------------------
     */

    await runStage(results, "17", "Unload Kokoro", async () => {
      await context!.runtimeManager.unload();

      const health = await kokoroRuntime!.health();

      if (health.ready) {
        throw new Error("Kokoro runtime still reports ready after unload.");
      }

      printSuccess("Kokoro runtime unloaded.");
    });

    /**
     * ------------------------------------------------------------------------
     * Stage 18 — Round-trip
     * ------------------------------------------------------------------------
     */

    if (RUN_ROUND_TRIP) {
      await runStage(
        results,
        "18",
        "Reload Whisper for TTS → STT round-trip",
        async () => {
          await context!.modelManager.ensureLoaded(context!.whisperModel.id);

          const health = await whisperRuntime!.health();

          if (!health.ready) {
            throw new Error("Whisper failed to reload for round-trip.");
          }

          printSuccess("Whisper reloaded successfully.");
        },
      );

      /**
       * ----------------------------------------------------------------------
       * Stage 19 — REAL generated speech recognition
       * ----------------------------------------------------------------------
       */

      await runStage(
        results,
        "19",
        "Run REAL TTS → STT round-trip",
        async () => {
          const result = await context!.modelManager.transcribe({
            audioFilePath: context!.generatedAudioPath,

            language: TEST_LANGUAGE,

            threads: TEST_THREADS,
          });

          const roundTripTranscript = result.text.trim();

          if (!roundTripTranscript) {
            throw new Error(
              "Whisper returned an empty transcript for the Kokoro-generated WAV.",
            );
          }

          printSuccess(`Round-trip STT completed in ${result.durationMs} ms.`);

          printTranscript("Round-trip transcript", roundTripTranscript);

          const similarity = calculateTextSimilarity(
            TEST_TEXT,
            roundTripTranscript,
          );

          printInfo(`Text similarity: ${(similarity * 100).toFixed(1)}%`);

          /*
           * We deliberately do NOT require a 100% textual match.
           *
           * Speech recognition naturally differs from source text.
           *
           * We only reject a transcript that is clearly unrelated.
           */
          if (similarity < 0.2) {
            throw new Error(
              `Round-trip transcript similarity is too low: ` +
                `${(similarity * 100).toFixed(1)}%.`,
            );
          }
        },
      );
    } else {
      printInfo("Round-trip disabled by VEYRA_VOICE_TEST_ROUND_TRIP.");
    }

    /**
     * ------------------------------------------------------------------------
     * Final unload
     * ------------------------------------------------------------------------
     */

    await runStage(
      results,
      RUN_ROUND_TRIP ? "20" : "18",
      "Final runtime cleanup",
      async () => {
        await context!.runtimeManager.unload();

        const whisperHealth = await whisperRuntime!.health();

        const kokoroHealth = await kokoroRuntime!.health();

        if (whisperHealth.ready) {
          throw new Error(
            "Whisper runtime remained loaded during final cleanup.",
          );
        }

        if (kokoroHealth.ready) {
          throw new Error(
            "Kokoro runtime remained loaded during final cleanup.",
          );
        }

        printSuccess("All voice runtimes unloaded.");
      },
    );

    /**
     * ------------------------------------------------------------------------
     * Cleanup generated test files
     * ------------------------------------------------------------------------
     */

    await cleanupTemporaryFiles(context, results);

    printFinalSuccess(results, Date.now() - startedAt);
  } catch (error) {
    await safeCleanup(context, whisperRuntime, kokoroRuntime);

    printFinalFailure(results, Date.now() - startedAt, error);

    process.exitCode = 1;
  }
}

/**
 * ============================================================================
 * Context
 * ============================================================================
 */

function createContext(): TestContext {
  const paths = new ModelPaths({
    applicationDataDirectory: MODEL_ROOT,
  });

  const storage = new ModelStorage({
    paths,
  });

  const queue = new ModelDownloadQueue({
    stateFilePath: paths.getDownloadQueueStatePath(),

    concurrency: 1,

    modelResolver: (modelId) => defaultModelRegistry.get(modelId),
  });

  const installationManager = new ModelInstallationManager({
    queue,

    storage,
  });

  const runtimeInstaller = new RuntimeInstaller({
    paths,
  });

  const runtimeRegistry = new RuntimeRegistry();

  const runtimeManager = new ModelRuntimeManager({
    storage,

    runtimeRegistry,
  });

  const modelManager = new ModelManager(
    {
      selection: {
        fallbackCount: 3,

        allowWarnings: true,
      },

      installationManager,

      runtimeManager,
    },

    defaultModelRegistry,

    undefined,

    installationManager,

    runtimeManager,
  );

  const whisperModel = defaultModelRegistry.get(DEFAULT_WHISPER_MODEL_ID);

  const kokoroModel = defaultModelRegistry.get(DEFAULT_KOKORO_MODEL_ID);

  if (!whisperModel) {
    throw new Error(
      `Required model "${DEFAULT_WHISPER_MODEL_ID}" was not found in ModelRegistry.`,
    );
  }

  if (!kokoroModel) {
    throw new Error(
      `Required model "${DEFAULT_KOKORO_MODEL_ID}" was not found in ModelRegistry.`,
    );
  }

  const temporaryDirectory = path.join(MODEL_ROOT, "cache", "voice-test");

  const generatedAudioPath = path.join(
    temporaryDirectory,
    "kokoro-generated.wav",
  );

  const roundTripAudioPath = path.join(temporaryDirectory, "round-trip.wav");

  return {
    paths,

    storage,

    queue,

    installationManager,

    runtimeInstaller,

    runtimeRegistry,

    runtimeManager,

    modelManager,

    whisperModel,

    kokoroModel,

    temporaryDirectory,

    generatedAudioPath,

    roundTripAudioPath,
  };
}

/**
 * ============================================================================
 * Environment validation
 * ============================================================================
 */

async function validateEnvironment(): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error(
      `Veyra local voice test currently expects Windows. Detected: ${process.platform}`,
    );
  }

  if (process.arch !== "x64") {
    throw new Error(
      `Veyra local voice test currently expects Windows x64. Detected: ${process.arch}`,
    );
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);

  if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    throw new Error(`Node.js 20+ is required. Detected ${process.version}.`);
  }

  printSuccess(`Platform: ${process.platform} ${process.arch}`);

  printSuccess(`Node.js: ${process.version}`);

  printInfo(`CPU cores: ${os.cpus().length}`);

  printInfo(`System memory: ${formatBytes(os.totalmem())}`);

  printInfo(`Available memory: ${formatBytes(os.freemem())}`);

  if (!VOICE_TEST_AUDIO) {
    throw new Error(
      [
        "No speech WAV was supplied.",
        "",
        "Set:",
        '  $env:VEYRA_VOICE_TEST_AUDIO="C:\\path\\to\\speech.wav"',
        "",
        "Then run:",
        "  npm run veyra:voice:test",
        "",
        "The test intentionally does not generate fake speech.",
      ].join("\n"),
    );
  }

  await assertReadableFile(VOICE_TEST_AUDIO, "VEYRA_VOICE_TEST_AUDIO");
}

/**
 * ============================================================================
 * Model validation
 * ============================================================================
 */

function assertModelSupport(
  context: TestContext,
  model: ModelDefinition,
  label: string,
): void {
  if (!model.id) {
    throw new Error(`${label} model has no ID.`);
  }

  if (model.modality !== (label === "Whisper" ? "stt" : "tts")) {
    throw new Error(
      `${label} model "${model.id}" has unexpected modality "${model.modality}".`,
    );
  }

  if (label === "Whisper") {
    if (model.runtime !== "whisper_cpp") {
      throw new Error(
        `Whisper model "${model.id}" must use whisper_cpp. ` +
          `Actual runtime: ${model.runtime}`,
      );
    }
  }

  if (label === "Kokoro") {
    if (model.runtime !== "kokoro") {
      throw new Error(
        `Kokoro model "${model.id}" must use kokoro runtime. ` +
          `Actual runtime: ${model.runtime}`,
      );
    }
  }

  void context;
}

/**
 * ============================================================================
 * Whisper executable discovery
 * ============================================================================
 */

async function locateWhisperExecutable(
  runtimeDirectory: string,
): Promise<string> {
  const preferredNames = ["whisper-cli.exe", "whisper-cli"];

  const found = await findFileRecursively(runtimeDirectory, preferredNames, 8);

  if (!found) {
    throw new Error(
      [
        "whisper-cli executable was not found.",
        "",
        `Runtime directory: ${runtimeDirectory}`,
        "",
        "Expected one of:",
        ...preferredNames.map((name) => `  ${name}`),
      ].join("\n"),
    );
  }

  return path.resolve(found);
}

/**
 * ============================================================================
 * Kokoro package verification
 * ============================================================================
 */

async function verifyKokoroPackage(
  model: ModelDefinition,
  storage: ModelStorage,
): Promise<void> {
  const stored = await storage.getStoredModel(model);

  if (!stored) {
    throw new Error("Kokoro storage record is missing.");
  }

  await assertReadableFile(stored.artifactPath, "Kokoro primary artifact");

  const artifactPaths = stored.artifactPaths ?? {};

  const modelArtifact = artifactPaths.model || stored.artifactPath;

  if (!modelArtifact) {
    throw new Error("Kokoro model artifact path is missing.");
  }

  await assertReadableFile(modelArtifact, "Kokoro model artifact");

  /*
   * KokoroRuntime currently requires:
   *
   * config.json
   * tokenizer.json
   * tokenizer_config.json
   * voices/
   *
   * We therefore verify the actual runtime directory before attempting
   * to load it.
   */

  const modelDirectory = await locateKokoroModelDirectory(modelArtifact);

  printInfo(`Kokoro model directory: ${modelDirectory}`);

  const requiredFiles = [
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
  ];

  for (const filename of requiredFiles) {
    const filePath = path.join(modelDirectory, filename);

    await assertReadableFile(filePath, `Kokoro ${filename}`);
  }

  const voicesDirectory = path.join(modelDirectory, "voices");

  const voicesStat = await fs.stat(voicesDirectory);

  if (!voicesStat.isDirectory()) {
    throw new Error(
      `Kokoro voices path is not a directory: ${voicesDirectory}`,
    );
  }

  const voiceEntries = await fs.readdir(voicesDirectory);

  if (voiceEntries.length === 0) {
    throw new Error(`Kokoro voices directory is empty: ${voicesDirectory}`);
  }

  printSuccess(
    `Kokoro runtime package contains ${voiceEntries.length} voice asset(s).`,
  );

  /*
   * Verify the requested voice exists if the package exposes a matching
   * file. The actual KokoroRuntime performs the authoritative voice check
   * after loading.
   */
  printInfo(`Requested voice: ${TEST_VOICE}`);

  printSuccess("Kokoro package structure verified.");
}

/**
 * ============================================================================
 * Kokoro model directory
 * ============================================================================
 */

async function locateKokoroModelDirectory(
  modelArtifactPath: string,
): Promise<string> {
  let current = path.dirname(path.resolve(modelArtifactPath));

  for (let depth = 0; depth < 6; depth += 1) {
    const configPath = path.join(current, "config.json");

    const tokenizerPath = path.join(current, "tokenizer.json");

    const tokenizerConfigPath = path.join(current, "tokenizer_config.json");

    const voicesPath = path.join(current, "voices");

    if (
      (await fileExists(configPath)) &&
      (await fileExists(tokenizerPath)) &&
      (await fileExists(tokenizerConfigPath)) &&
      (await directoryExists(voicesPath))
    ) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      break;
    }

    current = parent;
  }

  throw new Error(
    [
      "Complete Kokoro model directory was not found.",
      "",
      `Starting artifact: ${modelArtifactPath}`,
      "",
      "KokoroRuntime requires:",
      "  config.json",
      "  tokenizer.json",
      "  tokenizer_config.json",
      "  voices/",
    ].join("\n"),
  );
}

/**
 * ============================================================================
 * WAV validation
 * ============================================================================
 */

async function validateSpeechInputAudio(filePath: string): Promise<WavInfo> {
  if (!filePath.trim()) {
    throw new Error("Speech input WAV path is empty.");
  }

  return readWavInfo(path.resolve(filePath), "Speech input WAV");
}

async function validateGeneratedWav(filePath: string): Promise<WavInfo> {
  const info = await readWavInfo(filePath, "Kokoro generated WAV");

  if (info.fileSizeBytes <= 44) {
    throw new Error("Generated WAV is too small to contain valid audio.");
  }

  if (info.dataBytes <= 0) {
    throw new Error("Generated WAV contains no audio data.");
  }

  if (info.sampleRate <= 0) {
    throw new Error("Generated WAV has an invalid sample rate.");
  }

  if (info.channels <= 0) {
    throw new Error("Generated WAV has an invalid channel count.");
  }

  return info;
}

async function readWavInfo(filePath: string, label: string): Promise<WavInfo> {
  const absolutePath = path.resolve(filePath);

  await assertReadableFile(absolutePath, label);

  const stat = await fs.stat(absolutePath);

  if (stat.size < 44) {
    throw new Error(`${label} is smaller than the minimum WAV header size.`);
  }

  const file = await fs.open(absolutePath, "r");

  try {
    const header = Buffer.alloc(Math.min(64 * 1024, stat.size));

    const result = await file.read(header, 0, header.length, 0);

    const bytes = header.subarray(0, result.bytesRead);

    const riff = bytes.toString("ascii", 0, 4);

    const wave = bytes.toString("ascii", 8, 12);

    if (riff !== "RIFF") {
      throw new Error(`${label} does not have a RIFF header.`);
    }

    if (wave !== "WAVE") {
      throw new Error(`${label} is not a WAVE file.`);
    }

    let offset = 12;

    let audioFormat = 0;

    let channels = 0;

    let sampleRate = 0;

    let bitsPerSample = 0;

    let dataBytes = 0;

    while (offset + 8 <= bytes.length) {
      const chunkId = bytes.toString("ascii", offset, offset + 4);

      const chunkSize = bytes.readUInt32LE(offset + 4);

      const dataStart = offset + 8;

      const dataEnd = dataStart + chunkSize;

      if (dataEnd > stat.size) {
        throw new Error(
          `${label} contains a WAV chunk outside the file bounds.`,
        );
      }

      if (chunkId === "fmt ") {
        if (chunkSize < 16 || dataStart + 16 > bytes.length) {
          throw new Error(`${label} contains an invalid fmt chunk.`);
        }

        audioFormat = bytes.readUInt16LE(dataStart);

        channels = bytes.readUInt16LE(dataStart + 2);

        sampleRate = bytes.readUInt32LE(dataStart + 4);

        bitsPerSample = bytes.readUInt16LE(dataStart + 14);
      }

      if (chunkId === "data") {
        dataBytes = chunkSize;

        break;
      }

      /*
       * WAV chunks are word aligned.
       */
      offset = dataEnd + (chunkSize % 2);
    }

    if (audioFormat === 0) {
      throw new Error(`${label} does not contain a valid fmt chunk.`);
    }

    if (dataBytes <= 0) {
      throw new Error(`${label} does not contain a data chunk.`);
    }

    const bytesPerSample = Math.max(1, bitsPerSample / 8);

    const durationSeconds =
      channels > 0 && sampleRate > 0 && bytesPerSample > 0
        ? dataBytes / (sampleRate * channels * bytesPerSample)
        : 0;

    return Object.freeze({
      filePath: absolutePath,

      fileSizeBytes: stat.size,

      audioFormat,

      channels,

      sampleRate,

      bitsPerSample,

      dataBytes,

      durationSeconds,
    });
  } finally {
    await file.close();
  }
}

/**
 * ============================================================================
 * Text similarity
 * ============================================================================
 */

function calculateTextSimilarity(expected: string, actual: string): number {
  const a = normalizeTextForComparison(expected);

  const b = normalizeTextForComparison(actual);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  const aWords = a.split(" ");

  const bWords = b.split(" ");

  const bSet = new Set(bWords);

  let matchingWords = 0;

  for (const word of aWords) {
    if (bSet.has(word)) {
      matchingWords += 1;
    }
  }

  const wordScore = matchingWords / Math.max(aWords.length, bWords.length);

  const characterScore = levenshteinSimilarity(a, b);

  return Math.max(0, Math.min(1, wordScore * 0.7 + characterScore * 0.3));
}

function normalizeTextForComparison(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }

  if (!a || !b) {
    return 0;
  }

  const previous = new Array<number>(b.length + 1);

  const current = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) {
    previous[j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }

    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }

  const distance = previous[b.length];

  return Math.max(0, 1 - distance / Math.max(a.length, b.length));
}

/**
 * ============================================================================
 * Filesystem helpers
 * ============================================================================
 */

async function assertReadableFile(
  filePath: string,
  label: string,
): Promise<void> {
  try {
    const stat = await fs.stat(filePath);

    if (!stat.isFile()) {
      throw new Error(`${label} is not a regular file.`);
    }

    await fs.access(filePath);
  } catch (error) {
    throw new Error(`${label} is not accessible: ${filePath}`, {
      cause: error,
    });
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);

    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(directoryPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(directoryPath);

    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function findFileRecursively(
  rootDirectory: string,
  filenames: readonly string[],
  maxDepth: number,
): Promise<string | null> {
  const wanted = new Set(filenames.map((name) => name.toLowerCase()));

  async function walk(
    directory: string,
    depth: number,
  ): Promise<string | null> {
    if (depth > maxDepth) {
      return null;
    }

    let entries;

    try {
      entries = await fs.readdir(directory, {
        withFileTypes: true,
      });
    } catch {
      return null;
    }

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isFile() && wanted.has(entry.name.toLowerCase())) {
        return fullPath;
      }
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const found = await walk(path.join(directory, entry.name), depth + 1);

      if (found) {
        return found;
      }
    }

    return null;
  }

  return walk(path.resolve(rootDirectory), 0);
}

/**
 * ============================================================================
 * Cleanup
 * ============================================================================
 */

async function cleanupTemporaryFiles(
  context: TestContext | null,
  results: TestResult[],
): Promise<void> {
  if (!context) {
    return;
  }

  if (KEEP_OUTPUT) {
    printInfo(`Keeping voice test output: ${context.temporaryDirectory}`);

    return;
  }

  await fs.rm(context.temporaryDirectory, {
    recursive: true,
    force: true,
  });

  printSuccess("Temporary voice test output removed.");

  void results;
}

async function safeCleanup(
  context: TestContext | null,
  whisperRuntime: WhisperCppRuntime | null,
  kokoroRuntime: KokoroRuntime | null,
): Promise<void> {
  try {
    if (context) {
      await context.runtimeManager.unload();
    }
  } catch {
    // Best-effort cleanup.
  }

  try {
    await whisperRuntime?.unload();
  } catch {
    // Best-effort cleanup.
  }

  try {
    await kokoroRuntime?.unload();
  } catch {
    // Best-effort cleanup.
  }
}

/**
 * ============================================================================
 * Stage runner
 * ============================================================================
 */

async function runStage<T>(
  results: TestResult[],
  number: string,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  console.log();

  console.log(`${CYAN}[${number}]${RESET} ${name}`);

  try {
    const result = await withTimeout(
      operation(),
      TEST_TIMEOUT_MS,
      `${number} ${name}`,
    );

    const durationMs = Date.now() - startedAt;

    results.push({
      name,

      durationMs,
    });

    console.log(`${GREEN}✓${RESET} ${name} ${DIM}(${durationMs} ms)${RESET}`);

    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;

    console.log(`${RED}✗${RESET} ${name} ${DIM}(${durationMs} ms)${RESET}`);

    throw new Error(`[${number}] ${name} failed: ${getErrorMessage(error)}`, {
      cause: error,
    });
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,

      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${operationName} exceeded ${timeoutMs} ms.`));
        }, timeoutMs);

        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * ============================================================================
 * Output
 * ============================================================================
 */

function printHeader(): void {
  console.log();

  console.log(
    `${CYAN}============================================================${RESET}`,
  );

  console.log(`${CYAN}              VEYRA LOCAL VOICE TEST${RESET}`);

  console.log(
    `${CYAN}============================================================${RESET}`,
  );

  console.log();

  console.log("REAL Whisper.cpp STT + REAL Kokoro TTS");
}

function printConfiguration(): void {
  console.log();

  console.log(`${DIM}Configuration${RESET}`);

  console.log(`  Model root:       ${MODEL_ROOT}`);

  console.log(`  Whisper model:    ${DEFAULT_WHISPER_MODEL_ID}`);

  console.log(`  Kokoro model:     ${DEFAULT_KOKORO_MODEL_ID}`);

  console.log(`  Input audio:      ${VOICE_TEST_AUDIO}`);

  console.log(`  Language:         ${TEST_LANGUAGE}`);

  console.log(`  Threads:          ${TEST_THREADS}`);

  console.log(`  Voice:            ${TEST_VOICE}`);

  console.log(`  Round-trip:       ${RUN_ROUND_TRIP ? "enabled" : "disabled"}`);

  console.log(`  Keep output:      ${KEEP_OUTPUT ? "yes" : "no"}`);
}

function printModelInfo(model: ModelDefinition): void {
  console.log(`  ${model.displayName} (${model.id})`);

  console.log(`    modality: ${model.modality}`);

  console.log(`    runtime:  ${model.runtime}`);
}

function printTranscript(label: string, transcript: string): void {
  console.log();

  console.log(`${YELLOW}${label}:${RESET}`);

  console.log(`  "${transcript}"`);
}

function printSuccess(message: string): void {
  console.log(`  ${GREEN}✓${RESET} ${message}`);
}

function printInfo(message: string): void {
  console.log(`  ${DIM}→${RESET} ${message}`);
}

function printFinalSuccess(
  results: readonly TestResult[],
  durationMs: number,
): void {
  console.log();

  console.log(
    `${GREEN}============================================================${RESET}`,
  );

  console.log(`${GREEN}                 VOICE TEST PASSED${RESET}`);

  console.log(
    `${GREEN}============================================================${RESET}`,
  );

  console.log();

  console.log(`Stages passed: ${results.length}`);

  console.log(`Total duration: ${durationMs} ms`);

  console.log();

  console.log(`${GREEN}REAL local STT and TTS are working.${RESET}`);

  console.log();
}

function printFinalFailure(
  results: readonly TestResult[],
  durationMs: number,
  error: unknown,
): void {
  console.error();

  console.error(
    `${RED}============================================================${RESET}`,
  );

  console.error(`${RED}                  VOICE TEST FAILED${RESET}`);

  console.error(
    `${RED}============================================================${RESET}`,
  );

  console.error();

  console.error(`Stages passed: ${results.length}`);

  console.error(`Duration: ${durationMs} ms`);

  console.error();

  console.error(`${RED}${getErrorMessage(error)}${RESET}`);

  console.error();

  console.error(
    `${DIM}No fake success was reported. The test exits non-zero when a real local stage fails.${RESET}`,
  );

  console.error();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * ============================================================================
 * Environment parsing
 * ============================================================================
 */

function parseBoolean(
  value: string | undefined,
  defaultValue = false,
): boolean {
  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

/**
 * ============================================================================
 * Formatting
 * ============================================================================
 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB`;
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

/**
 * ============================================================================
 * ANSI
 * ============================================================================
 */

const RESET = "\x1b[0m";

const GREEN = "\x1b[32m";

const RED = "\x1b[31m";

const CYAN = "\x1b[36m";

const YELLOW = "\x1b[33m";

const DIM = "\x1b[2m";

/**
 * ============================================================================
 * Entry point
 * ============================================================================
 */

void main();

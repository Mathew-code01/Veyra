// core/models/runtime/ModelRuntime.ts
// core/models/runtime/ModelRuntime.ts

import type { ModelDefinition } from "../ModelRegistry";

/**
 * ============================================================================
 * Common runtime loading
 * ============================================================================
 */

export interface ModelRuntimeLoadOptions {
  /**
   * Primary model artifact path.
   *
   * Resolved by ModelRuntimeManager from verified ModelStorage state.
   * Renderer-supplied paths must never be trusted here.
   */
  readonly modelPath: string;

  /**
   * All verified artifact paths belonging to the installed package.
   *
   * Example:
   *
   * {
   *   model: ".../model.gguf",
   *   mmproj: ".../mmproj.gguf"
   * }
   */
  readonly artifactPaths?: Readonly<Record<string, string>>;

  readonly contextSize?: number;

  readonly gpuLayers?: number;

  readonly threads?: number;

  readonly batchSize?: number;

  readonly signal?: AbortSignal;
}

/**
 * ============================================================================
 * Text generation
 * ============================================================================
 */

export interface ModelRuntimeGenerateOptions {
  readonly prompt: string;

  readonly maxTokens?: number;

  readonly temperature?: number;

  readonly topP?: number;

  readonly signal?: AbortSignal;

  /**
   * Called as soon as a partial generation token arrives.
   *
   * This must never block the runtime.
   */
  readonly onToken?: (token: string) => void;
}

export interface ModelRuntimeGenerationResult {
  readonly text: string;

  readonly promptTokens?: number;

  readonly completionTokens?: number;

  readonly durationMs: number;

  readonly firstTokenMs?: number;

  readonly tokensPerSecond?: number;
}

/**
 * ============================================================================
 * Vision / multimodal generation
 * ============================================================================
 */

export interface VisionGenerationOptions extends ModelRuntimeGenerateOptions {
  /**
   * Local image file.
   *
   * Mutually exclusive with imageDataUrl.
   */
  readonly imagePath?: string;

  /**
   * Pre-encoded image data URL.
   *
   * Example:
   *
   * data:image/png;base64,...
   *
   * Mutually exclusive with imagePath.
   */
  readonly imageDataUrl?: string;

  /**
   * Explicit media type when imagePath is used.
   */
  readonly imageMimeType?: string;
}

export interface VisionGenerationRuntime extends TextGenerationRuntime {
  generateVision(
    options: VisionGenerationOptions,
  ): Promise<ModelRuntimeGenerationResult>;
}

/**
 * ============================================================================
 * Runtime health
 * ============================================================================
 */

export interface ModelRuntimeHealth {
  readonly ready: boolean;

  readonly loadedModelId: string | null;

  readonly runtimeName: string;

  readonly runtimeVersion?: string;
}

/**
 * ============================================================================
 * Base runtime
 * ============================================================================
 */

export interface ModelRuntime {
  readonly name: string;

  supports(model: ModelDefinition): boolean;

  load(model: ModelDefinition, options: ModelRuntimeLoadOptions): Promise<void>;

  health(): Promise<ModelRuntimeHealth>;

  unload(): Promise<void>;
}

/**
 * ============================================================================
 * Text generation runtime
 * ============================================================================
 */

export interface TextGenerationRuntime extends ModelRuntime {
  generate(
    options: ModelRuntimeGenerateOptions,
  ): Promise<ModelRuntimeGenerationResult>;
}

/**
 * ============================================================================
 * Speech recognition
 * ============================================================================
 */

export interface SpeechRecognitionOptions {
  readonly audioFilePath: string;

  readonly language?: string;

  readonly threads?: number;

  readonly signal?: AbortSignal;
}

export interface SpeechRecognitionResult {
  readonly text: string;

  readonly durationMs: number;

  readonly language?: string;
}

export interface SpeechRecognitionRuntime extends ModelRuntime {
  transcribe(
    options: SpeechRecognitionOptions,
  ): Promise<SpeechRecognitionResult>;
}

/**
 * ============================================================================
 * TRUE REALTIME SPEECH RECOGNITION
 * ============================================================================
 *
 * The realtime implementation is backed by whisper-stream.
 *
 * It continuously listens to the system microphone, emits partial transcript
 * updates, and can be stopped deterministically.
 */

export interface RealtimeSpeechRecognitionOptions {
  /**
   * Optional Whisper language code.
   *
   * Example:
   *
   * en
   */
  readonly language?: string;

  /**
   * Number of inference threads.
   */
  readonly threads?: number;

  /**
   * Audio step in milliseconds.
   *
   * Default: 500.
   */
  readonly stepMs?: number;

  /**
   * Sliding inference window in milliseconds.
   *
   * Default: 5000.
   */
  readonly lengthMs?: number;

  /**
   * VAD threshold when supported by the selected whisper-stream build.
   */
  readonly vadThreshold?: number;

  readonly signal?: AbortSignal;

  /**
   * Called whenever a new partial transcript is available.
   *
   * This callback should be extremely lightweight.
   */
  readonly onPartial: (text: string) => void;

  /**
   * Called when the realtime stream is stopped and a final transcript
   * has been assembled.
   */
  readonly onFinal?: (text: string) => void;

  /**
   * Called when the stream encounters an unrecoverable runtime error.
   */
  readonly onError?: (error: Error) => void;
}

export interface SpeechRecognitionRealtimeSession {
  /**
   * Stop the stream and return the best accumulated transcript.
   */
  stop(): Promise<SpeechRecognitionResult>;

  /**
   * Whether stop() has already been requested.
   */
  readonly stopped: boolean;
}

export interface RealtimeSpeechRecognitionRuntime
  extends SpeechRecognitionRuntime {
  startRealtime(
    options: RealtimeSpeechRecognitionOptions,
  ): Promise<SpeechRecognitionRealtimeSession>;
}

/**
 * ============================================================================
 * ONNX / generic inference
 * ============================================================================
 */

export interface OnnxRuntimeRunOptions {
  readonly feeds: Record<string, unknown>;

  readonly fetches?: readonly string[];

  readonly signal?: AbortSignal;
}

export interface OnnxRuntimeRunResult {
  readonly outputs: Record<string, unknown>;

  readonly durationMs: number;
}

export interface InferenceRuntime extends ModelRuntime {
  run(options: OnnxRuntimeRunOptions): Promise<OnnxRuntimeRunResult>;
}

/**
 * ============================================================================
 * Text-to-speech
 * ============================================================================
 */

export interface SpeechSynthesisOptions {
  readonly text: string;

  /**
   * Voice identifier.
   *
   * Example:
   *
   * af_heart
   */
  readonly voice?: string;

  /**
   * Playback speed multiplier.
   */
  readonly speed?: number;

  /**
   * Output WAV path.
   *
   * The runtime owns creation of this file.
   */
  readonly outputFilePath: string;

  readonly signal?: AbortSignal;
}

export interface SpeechSynthesisResult {
  readonly audioFilePath: string;

  readonly durationMs: number;

  readonly sampleRate: number;

  readonly voice: string;
}

export interface SpeechSynthesisRuntime extends ModelRuntime {
  synthesize(options: SpeechSynthesisOptions): Promise<SpeechSynthesisResult>;
}
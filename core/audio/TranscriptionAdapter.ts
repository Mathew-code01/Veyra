// ============================================================================
// FILE: core/audio/TranscriptionAdapter.ts
// PURPOSE:
// Transcription adapter boundary.
//
// RESPONSIBILITY:
// - Present a single adapter contract over transcription providers.
// - Distinguish REAL providers (Whisper, local Whisper, cloud) from MOCK
//   providers used only for testing. Mock providers must never be used in
//   production without explicit, audited opt-in.
// - Enforce consent for providers that require it (cloud transcription).
// - Never perform real provider calls, model downloads, or network access
//   from a mock adapter.
//
// ARCHITECTURAL RULE:
// This file is part of core/audio. It does NOT implement audio capture,
// conversation analysis, or interview intelligence. Those are separate
// subsystems that consume transcribed text through the shared contract.
// ============================================================================

import type {
  PartialTranscription,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
} from "./TranscriptionEngine";

import { WhisperEngine } from "./WhisperEngine";
import { LocalWhisperProvider } from "./LocalWhisperProvider";

// ============================================================================
// TYPES
// ============================================================================

export type TranscriptionProviderType = "mock" | "real";

export interface TranscriptionAdapterOptions {
  readonly provider: TranscriptionProvider;

  /**
   * Whether this adapter wraps a real provider or a test mock.
   */
  readonly providerType: TranscriptionProviderType;

  /**
   * Whether the provider requires explicit external-processing consent
   * before any audio may be sent to it. Cloud providers require consent;
   * local providers do not.
   */
  readonly requiresConsent: boolean;
}

export interface TranscriptionAdapterConsent {
  readonly granted: boolean;
  readonly grantedAt?: string;
}

// ============================================================================
// MOCK PROVIDER (testing only)
// ============================================================================

/**
 * Deterministic transcription provider used exclusively in tests.
 *
 * It performs NO network access, NO model download, and NO real transcription.
 * Output is derived from the input audio length so tests remain reproducible.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  public readonly name = "mock-transcription";

  private readonly fixedText: string;

  public constructor(fixedText?: string) {
    this.fixedText = fixedText ?? "This is a mocked transcript segment for testing.";
  }

  public async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (request.signal?.aborted) {
      throw new DOMException("Mock transcription was aborted.", "AbortError");
    }

    // Derive a stable, deterministic transcript from audio length so tests
    // remain reproducible without any real audio or model.
    const words = Math.max(1, Math.floor(request.audio.byteLength / 200));
    const text = (this.fixedText.split(" ").slice(0, words).join(" ") || this.fixedText).trim();

    return Object.freeze({
      text,
      language: request.language ?? "en",
      confidence: 0.95,
      durationMs: request.audio.byteLength > 0 ? 1000 : 0,
      words: [],
      provider: this.name,
      model: "mock-model",
    });
  }

  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult> {
    if (typeof onPartial !== "function") {
      throw new Error("Mock transcription requires an onPartial callback.");
    }

    const result = await this.transcribe(request);

    onPartial({
      text: result.text,
      timestamp: Date.now(),
      isFinal: true,
      confidence: result.confidence,
    });

    return result;
  }
}

// ============================================================================
// ADAPTER
// ============================================================================

/**
 * Single adapter contract over transcription providers.
 *
 * Production use must instantiate a REAL provider (e.g. WhisperEngine or
 * LocalWhisperProvider) with providerType "real". Tests must use a mock
 * provider with providerType "mock". The two are never conflated.
 */
export class TranscriptionAdapter {
  public readonly provider: TranscriptionProvider;

  public readonly providerType: TranscriptionProviderType;

  public readonly requiresConsent: boolean;

  public readonly name: string;

  public constructor(options: TranscriptionAdapterOptions) {
    if (!options.provider) {
      throw new Error("TranscriptionAdapter requires a provider.");
    }

    this.provider = options.provider;
    this.providerType = options.providerType;
    this.requiresConsent = options.requiresConsent;
    this.name = options.provider.name;
  }

  public isMock(): boolean {
    return this.providerType === "mock";
  }

  public isReal(): boolean {
    return this.providerType === "real";
  }

  public requireConsent(): boolean {
    return this.requiresConsent;
  }

  public async transcribe(
    request: TranscriptionRequest,
    consentGiven: boolean = false,
  ): Promise<TranscriptionResult> {
    if (this.requiresConsent && consentGiven !== true) {
      throw new Error(
        `Transcription provider "${this.name}" requires explicit external-processing consent.`,
      );
    }

    return this.provider.transcribe(request);
  }

  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
    consentGiven: boolean = false,
  ): Promise<TranscriptionResult> {
    if (this.requiresConsent && consentGiven !== true) {
      throw new Error(
        `Transcription provider "${this.name}" requires explicit external-processing consent.`,
      );
    }

    if (typeof onPartial !== "function") {
      throw new Error("TranscriptionAdapter.transcribeStream requires onPartial.");
    }

    if (!this.provider.transcribeStream) {
      throw new Error(
        `Transcription provider "${this.name}" does not support streaming transcription.`,
      );
    }

    return this.provider.transcribeStream(request, onPartial);
  }
}

// ============================================================================
// FACTORIES
// ============================================================================

/**
 * Build a mock transcription adapter for tests only.
 *
 * Never use this in production unless an explicit, audited opt-in exists.
 */
export function createMockTranscriptionAdapter(
  fixedText?: string,
): TranscriptionAdapter {
  return new TranscriptionAdapter({
    provider: new MockTranscriptionProvider(fixedText),
    providerType: "mock",
    requiresConsent: false,
  });
}

/**
 * Build a real cloud Whisper adapter.
 *
 * Requires explicit consent before transcribing. Does not perform any call
 * until transcribe() is invoked by an authorized user action.
 */
export function createRealCloudWhisperAdapter(options: {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly providerName?: string;
  readonly timeoutMs?: number;
}): TranscriptionAdapter {
  return new TranscriptionAdapter({
    provider: new WhisperEngine({
      endpoint: options.endpoint,
      apiKey: options.apiKey,
      model: options.model,
      providerName: options.providerName ?? "whisper-cloud",
      timeoutMs: options.timeoutMs,
    }),
    providerType: "real",
    requiresConsent: true,
  });
}

/**
 * Build a real local Whisper adapter.
 *
 * Local transcription does not require external-processing consent because
 * no audio leaves the device, but model loading is still gated by the
 * model manager and must not download models without authorization.
 */
export function createRealLocalWhisperAdapter(options: {
  readonly modelManager: unknown;
  readonly modelId?: string;
  readonly language?: string;
  readonly prompt?: string;
  readonly threads?: number;
  readonly tempDirectory?: string;
}): TranscriptionAdapter {
  return new TranscriptionAdapter({
    provider: new LocalWhisperProvider({
      modelManager: options.modelManager as any,
      modelId: options.modelId,
      language: options.language,
      prompt: options.prompt,
      threads: options.threads,
      tempDirectory: options.tempDirectory,
    }),
    providerType: "real",
    requiresConsent: false,
  });
}

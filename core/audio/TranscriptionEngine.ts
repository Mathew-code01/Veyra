// ============================================================================
// FILE: core/audio/TranscriptionEngine.ts
// PURPOSE:
// Core transcription orchestration boundary.
//
// RESPONSIBILITY:
// - Define transcription requests/results.
// - Manage provider execution.
// - Enforce concurrency limits.
// - Propagate cancellation.
// - Normalize provider errors.
//
// IMPORTANT:
// This is an INTERNAL core/audio contract.
// It must not be copied into shared/.
// ============================================================================

// ============================================================================
// AUDIO FORMAT
// ============================================================================

export interface TranscriptionAudioFormat {
  readonly sampleRate: number;

  readonly channels: number;

  readonly sampleFormat: "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm";

  readonly bitDepth?: 16 | 24 | 32;
}

// ============================================================================
// REQUEST
// ============================================================================

export interface TranscriptionRequest {
  /**
   * Raw audio bytes.
   */
  readonly audio: Uint8Array;

  /**
   * MIME type associated with the supplied audio.
   */
  readonly mimeType?: string;

  /**
   * Actual audio format.
   *
   * Particularly important for raw PCM.
   */
  readonly format?: TranscriptionAudioFormat;

  readonly language?: string;

  readonly prompt?: string;

  /**
   * Capture timestamp associated with this request.
   *
   * This is metadata only. It is NOT interpreted as a transcript
   * segment start/end time by the transcription engine.
   */
  readonly timestamp?: number;

  /**
   * Abort the operation.
   */
  readonly signal?: AbortSignal;
}

// ============================================================================
// WORD
// ============================================================================

export interface TranscriptionWord {
  readonly word: string;

  readonly startMs?: number;

  readonly endMs?: number;

  readonly confidence?: number;
}

// ============================================================================
// RESULT
// ============================================================================

export interface TranscriptionResult {
  readonly text: string;

  readonly language?: string;

  readonly confidence?: number;

  readonly durationMs?: number;

  readonly words?: readonly TranscriptionWord[];

  readonly provider: string;

  readonly model?: string;
}

// ============================================================================
// PARTIAL RESULT
// ============================================================================

export interface PartialTranscription {
  readonly text: string;

  /**
   * Timestamp associated with this partial result.
   */
  readonly timestamp: number;

  readonly isFinal: boolean;

  readonly confidence?: number;
}

// ============================================================================
// PROVIDER
// ============================================================================

export interface TranscriptionProvider {
  readonly name: string;

  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;

  /**
   * Optional provider-level streaming implementation.
   *
   * The provider may emit zero or more partial results and must resolve
   * with the final TranscriptionResult.
   */
  transcribeStream?(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult>;
}

// ============================================================================
// ENGINE OPTIONS
// ============================================================================

export interface TranscriptionEngineOptions {
  readonly provider: TranscriptionProvider;

  /**
   * Maximum number of simultaneous provider operations.
   *
   * Default: 1.
   */
  readonly maxConcurrentRequests?: number;
}

// ============================================================================
// INTERNAL QUEUED JOB
// ============================================================================

interface TranscriptionJob {
  readonly request: TranscriptionRequest;

  readonly stream: boolean;

  readonly onPartial?: (partial: PartialTranscription) => void;

  readonly resolve: (result: TranscriptionResult) => void;

  readonly reject: (error: Error) => void;

  settled: boolean;

  abortCleanup?: () => void;
}

// ============================================================================
// ENGINE
// ============================================================================

export class TranscriptionEngine {
  private readonly provider: TranscriptionProvider;

  private readonly maxConcurrentRequests: number;

  private activeRequests = 0;

  private readonly queue: TranscriptionJob[] = [];

  public constructor(options: TranscriptionEngineOptions) {
    if (!options.provider) {
      throw new Error("TranscriptionEngine requires a provider.");
    }

    this.provider = options.provider;

    this.maxConcurrentRequests = normalizeConcurrency(
      options.maxConcurrentRequests,
    );
  }

  // ==========================================================================
  // BATCH TRANSCRIPTION
  // ==========================================================================

  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    validateRequest(request);

    this.throwIfAborted(request.signal);

    return new Promise<TranscriptionResult>((resolve, reject) => {
      const job: TranscriptionJob = {
        request,

        stream: false,

        resolve,

        reject,

        settled: false,
      };

      this.attachAbortHandler(job);

      if (job.settled) {
        return;
      }

      this.queue.push(job);

      void this.drain();
    });
  }

  // ==========================================================================
  // STREAM TRANSCRIPTION
  // ==========================================================================

  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult> {
    validateRequest(request);

    if (typeof onPartial !== "function") {
      throw new Error(
        "TranscriptionEngine.transcribeStream requires onPartial.",
      );
    }

    this.throwIfAborted(request.signal);

    return new Promise<TranscriptionResult>((resolve, reject) => {
      const job: TranscriptionJob = {
        request,

        stream: true,

        onPartial,

        resolve,

        reject,

        settled: false,
      };

      this.attachAbortHandler(job);

      if (job.settled) {
        return;
      }

      this.queue.push(job);

      void this.drain();
    });
  }

  // ==========================================================================
  // STATE
  // ==========================================================================

  public getProviderName(): string {
    return this.provider.name;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveRequests(): number {
    return this.activeRequests;
  }

  public getMaxConcurrentRequests(): number {
    return this.maxConcurrentRequests;
  }

  // ==========================================================================
  // QUEUE
  // ==========================================================================

  private async drain(): Promise<void> {
    while (
      this.activeRequests < this.maxConcurrentRequests &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();

      if (!job) {
        return;
      }

      if (job.settled) {
        continue;
      }

      this.activeRequests += 1;

      void this.execute(job);
    }
  }

  private async execute(job: TranscriptionJob): Promise<void> {
    try {
      this.throwIfAborted(job.request.signal);

      let result: TranscriptionResult;

      if (job.stream && this.provider.transcribeStream) {
        result = await this.provider.transcribeStream(
          job.request,
          (partial) => {
            if (job.settled) {
              return;
            }

            try {
              job.onPartial?.(partial);
            } catch (error) {
              /*
               * Consumer callback failures must not corrupt the
               * provider operation.
               *
               * The provider remains responsible for producing the
               * transcription result.
               */
              void error;
            }
          },
        );
      } else {
        result = await this.provider.transcribe(job.request);

        /*
         * Providers without native streaming support receive a
         * deterministic final event so callers can use one interface.
         */
        if (job.stream) {
          job.onPartial?.({
            text: result.text,

            timestamp: job.request.timestamp ?? Date.now(),

            isFinal: true,

            confidence: result.confidence,
          });
        }
      }

      this.resolveJob(job, result);
    } catch (error) {
      this.rejectJob(job, normalizeError(error));
    } finally {
      this.activeRequests -= 1;

      job.abortCleanup?.();

      void this.drain();
    }
  }

  // ==========================================================================
  // CANCELLATION
  // ==========================================================================

  private attachAbortHandler(job: TranscriptionJob): void {
    const signal = job.request.signal;

    if (!signal) {
      return;
    }

    const abort = (): void => {
      if (job.settled) {
        return;
      }

      /*
       * If the job is still waiting in the queue, remove it immediately.
       *
       * If it is already executing, the signal is passed to the provider.
       * Provider implementations are responsible for honoring it.
       */
      const index = this.queue.indexOf(job);

      if (index >= 0) {
        this.queue.splice(index, 1);
      }

      this.rejectJob(job, createAbortError());
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, {
      once: true,
    });

    job.abortCleanup = () => {
      signal.removeEventListener("abort", abort);
    };
  }

  private resolveJob(job: TranscriptionJob, result: TranscriptionResult): void {
    if (job.settled) {
      return;
    }

    job.settled = true;

    job.abortCleanup?.();

    job.resolve(result);
  }

  private rejectJob(job: TranscriptionJob, error: Error): void {
    if (job.settled) {
      return;
    }

    job.settled = true;

    job.abortCleanup?.();

    job.reject(error);
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }

    throw createAbortError();
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function validateRequest(request: TranscriptionRequest): void {
  if (!request) {
    throw new Error("Transcription request is required.");
  }

  if (!(request.audio instanceof Uint8Array)) {
    throw new Error("Transcription request audio must be a Uint8Array.");
  }

  if (request.audio.byteLength === 0) {
    throw new Error("Cannot transcribe empty audio.");
  }
}

function normalizeConcurrency(value: number | undefined): number {
  if (value == null) {
    return 1;
  }

  if (!Number.isFinite(value)) {
    throw new Error("maxConcurrentRequests must be a finite number.");
  }

  return Math.max(1, Math.floor(value));
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Transcription request was aborted.", "AbortError");
  }

  const error = new Error("Transcription request was aborted.");

  error.name = "AbortError";

  return error;
}

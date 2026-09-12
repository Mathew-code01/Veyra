// core/audio/TranscriptionEngine.ts

export interface TranscriptionAudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly sampleFormat: "pcm_s16le" | "pcm_f32le" | "wav" | "opus" | "webm";
  readonly bitDepth?: 16 | 24 | 32;
}

export interface TranscriptionRequest {
  readonly audio: Uint8Array;

  /**
   * MIME type of the original audio.
   *
   * Examples:
   *
   * audio/wav
   * audio/webm
   * audio/opus
   */
  readonly mimeType?: string;

  /**
   * Actual audio format when the bytes come from AudioCapture.
   *
   * This is particularly important for raw PCM.
   */
  readonly format?: TranscriptionAudioFormat;

  readonly language?: string;

  readonly prompt?: string;

  readonly timestamp?: number;

  readonly signal?: AbortSignal;
}

export interface TranscriptionWord {
  readonly word: string;

  readonly startMs?: number;

  readonly endMs?: number;

  readonly confidence?: number;
}

export interface TranscriptionResult {
  readonly text: string;

  readonly language?: string;

  readonly confidence?: number;

  readonly durationMs?: number;

  readonly words?: readonly TranscriptionWord[];

  readonly provider: string;

  readonly model?: string;
}

export interface PartialTranscription {
  readonly text: string;

  readonly timestamp: number;

  readonly isFinal: boolean;

  readonly confidence?: number;
}

export interface TranscriptionProvider {
  readonly name: string;

  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;

  transcribeStream?(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult>;
}

export interface TranscriptionEngineOptions {
  readonly provider: TranscriptionProvider;

  readonly maxConcurrentRequests?: number;
}

export class TranscriptionEngine {
  private readonly provider: TranscriptionProvider;

  private readonly maxConcurrentRequests: number;

  private activeRequests = 0;

  private readonly queue: Array<{
    request: TranscriptionRequest;

    resolve: (result: TranscriptionResult) => void;

    reject: (error: Error) => void;
  }> = [];

  public constructor(options: TranscriptionEngineOptions) {
    this.provider = options.provider;

    this.maxConcurrentRequests = Math.max(
      1,
      options.maxConcurrentRequests ?? 1,
    );
  }

  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    if (request.audio.byteLength === 0) {
      throw new Error("Cannot transcribe empty audio.");
    }

    return new Promise<TranscriptionResult>((resolve, reject) => {
      this.queue.push({
        request,
        resolve,
        reject,
      });

      void this.drain();
    });
  }

  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult> {
    if (request.audio.byteLength === 0) {
      throw new Error("Cannot transcribe empty audio.");
    }

    if (!this.provider.transcribeStream) {
      const result = await this.transcribe(request);

      onPartial({
        text: result.text,

        timestamp: Date.now(),

        isFinal: true,

        confidence: result.confidence,
      });

      return result;
    }

    return this.provider.transcribeStream(request, onPartial);
  }

  public getProviderName(): string {
    return this.provider.name;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveRequests(): number {
    return this.activeRequests;
  }

  private async drain(): Promise<void> {
    while (
      this.activeRequests < this.maxConcurrentRequests &&
      this.queue.length > 0
    ) {
      const job = this.queue.shift();

      if (!job) {
        return;
      }

      this.activeRequests += 1;

      void this.execute(job);
    }
  }

  private async execute(job: {
    request: TranscriptionRequest;

    resolve: (result: TranscriptionResult) => void;

    reject: (error: Error) => void;
  }): Promise<void> {
    try {
      const result = await this.provider.transcribe(job.request);

      job.resolve(result);
    } catch (error) {
      job.reject(normalizeError(error));
    } finally {
      this.activeRequests -= 1;

      void this.drain();
    }
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

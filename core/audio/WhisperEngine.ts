// core/audio/WhisperEngine.ts


import type {
  PartialTranscription,
  TranscriptionProvider,
  TranscriptionRequest,
  TranscriptionResult,
  TranscriptionWord,
} from "./TranscriptionEngine";

export interface WhisperEngineOptions {
  readonly endpoint: string;
  readonly apiKey?: string;
  readonly model?: string;
  readonly providerName?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface WhisperResponse {
  readonly text?: string;
  readonly language?: string;
  readonly duration?: number;
  readonly segments?: readonly {
    readonly text?: string;
    readonly start?: number;
    readonly end?: number;
    readonly avg_logprob?: number;
    readonly words?: readonly {
      readonly word?: string;
      readonly start?: number;
      readonly end?: number;
      readonly probability?: number;
    }[];
  }[];
}

export class WhisperEngine implements TranscriptionProvider {
  public readonly name: string;

  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: WhisperEngineOptions) {
    const endpoint = options.endpoint.trim();

    if (!endpoint) {
      throw new Error("WhisperEngine requires a transcription endpoint.");
    }

    this.endpoint = endpoint;
    this.apiKey = options.apiKey;
    this.model = options.model?.trim() || "whisper-1";
    this.name = options.providerName?.trim() || "whisper";

    this.timeoutMs = Math.max(
      1_000,
      Math.floor(options.timeoutMs ?? 30_000),
    );

    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async transcribe(
    request: TranscriptionRequest,
  ): Promise<TranscriptionResult> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      if (request.signal?.aborted) {
        throw new DOMException(
          "Transcription request was aborted.",
          "AbortError",
        );
      }

      const body = new FormData();

      /*
       * TypeScript's DOM BlobPart typing requires an ArrayBuffer here.
       *
       * Creating a copy also guarantees that a SharedArrayBuffer-backed
       * Uint8Array cannot leak into the Blob constructor.
       */
      const audioBuffer = new ArrayBuffer(request.audio.byteLength);

      new Uint8Array(audioBuffer).set(request.audio);

      const blob = new Blob([audioBuffer], {
        type: request.mimeType ?? "audio/wav",
      });

      body.append("file", blob, "audio.wav");
      body.append("model", this.model);

      if (request.language?.trim()) {
        body.append("language", request.language.trim());
      }

      if (request.prompt?.trim()) {
        body.append("prompt", request.prompt.trim());
      }

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",

        headers: {
          ...(this.apiKey
            ? {
                Authorization: `Bearer ${this.apiKey}`,
              }
            : {}),
        },

        body,

        signal: combineAbortSignals(
          controller.signal,
          request.signal,
        ),
      });

      if (!response.ok) {
        const message = await safeReadResponseText(response);

        throw new Error(
          `Whisper request failed (${response.status}): ${message}`,
        );
      }

      const payload = (await response.json()) as WhisperResponse;

      return this.mapResponse(payload);
    } finally {
      clearTimeout(timeout);
    }
  }

  public async transcribeStream(
    request: TranscriptionRequest,
    onPartial: (partial: PartialTranscription) => void,
  ): Promise<TranscriptionResult> {
    if (typeof onPartial !== "function") {
      throw new Error("Whisper transcribeStream requires onPartial.");
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

  private mapResponse(
    response: WhisperResponse,
  ): TranscriptionResult {
    const segments = response.segments ?? [];

    const words: TranscriptionWord[] = [];

    for (const segment of segments) {
      for (const word of segment.words ?? []) {
        if (!word.word?.trim()) {
          continue;
        }

        words.push({
          word: word.word,
          startMs:
            word.start != null && Number.isFinite(word.start)
              ? word.start * 1000
              : undefined,
          endMs:
            word.end != null && Number.isFinite(word.end)
              ? word.end * 1000
              : undefined,
          confidence:
            word.probability != null &&
            Number.isFinite(word.probability)
              ? word.probability
              : undefined,
        });
      }
    }

    const confidenceValues = segments
      .map((segment) => segment.avg_logprob)
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      );

    const confidence =
      confidenceValues.length > 0
        ? normalizeWhisperConfidence(
            confidenceValues.reduce(
              (sum, value) => sum + value,
              0,
            ) / confidenceValues.length,
          )
        : undefined;

    return {
      text: response.text?.trim() ?? "",

      language: response.language,

      durationMs:
        response.duration != null &&
        Number.isFinite(response.duration)
          ? response.duration * 1000
          : undefined,

      confidence,

      words: words.length > 0 ? words : undefined,

      provider: this.name,

      model: this.model,
    };
  }
}

function normalizeWhisperConfidence(
  avgLogProb: number,
): number {
  return Math.min(
    1,
    Math.max(0, Math.exp(avgLogProb)),
  );
}

function combineAbortSignals(
  primary: AbortSignal,
  secondary?: AbortSignal,
): AbortSignal {
  if (!secondary) {
    return primary;
  }

  const controller = new AbortController();

  const abort = (): void => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  if (primary.aborted || secondary.aborted) {
    controller.abort();

    return controller.signal;
  }

  primary.addEventListener("abort", abort, {
    once: true,
  });

  secondary.addEventListener("abort", abort, {
    once: true,
  });

  return controller.signal;
}

async function safeReadResponseText(
  response: Response,
): Promise<string> {
  try {
    const text = await response.text();

    return text.slice(0, 2_000);
  } catch {
    return "Unknown transcription provider error.";
  }
}

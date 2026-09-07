// core/audio/VoiceActivityDetector.ts


// core/audio/VoiceActivityDetector.ts

export interface VADOptions {
  readonly sampleRate: number;
  readonly frameDurationMs?: number;
  readonly energyThreshold?: number;
  readonly zeroCrossingThreshold?: number;
  readonly speechStartFrames?: number;
  readonly speechEndFrames?: number;
  readonly minSpeechDurationMs?: number;
  readonly maxSilenceDurationMs?: number;
}

export interface VADFrame {
  readonly timestamp: number;
  readonly durationMs: number;
  readonly rms: number;
  readonly energyDb: number;
  readonly zeroCrossingRate: number;
  readonly isSpeech: boolean;
}

export interface SpeechSegment {
  readonly startTime: number;
  readonly endTime: number;
  readonly durationMs: number;
}

export type VADState = "silence" | "speech";

export class VoiceActivityDetector {
  private readonly sampleRate: number;
  private readonly frameSamples: number;
  private readonly energyThreshold: number;
  private readonly zeroCrossingThreshold: number;
  private readonly speechStartFrames: number;
  private readonly speechEndFrames: number;
  private readonly minSpeechDurationMs: number;
  private readonly maxSilenceDurationMs: number;

  private state: VADState = "silence";

  private speechFrameCount = 0;
  private silenceFrameCount = 0;

  private currentSpeechStart?: number;
  private lastSpeechTimestamp?: number;

  public constructor(options: VADOptions) {
    this.sampleRate = options.sampleRate;

    this.frameSamples = Math.max(
      1,
      Math.round(
        this.sampleRate * (options.frameDurationMs ?? 20) / 1000,
      ),
    );

    this.energyThreshold = options.energyThreshold ?? 0.012;
    this.zeroCrossingThreshold =
      options.zeroCrossingThreshold ?? 0.35;

    this.speechStartFrames = Math.max(
      1,
      options.speechStartFrames ?? 2,
    );

    this.speechEndFrames = Math.max(
      1,
      options.speechEndFrames ?? 8,
    );

    this.minSpeechDurationMs =
      options.minSpeechDurationMs ?? 120;

    this.maxSilenceDurationMs =
      options.maxSilenceDurationMs ?? 1200;
  }

  public process(
    samples: Float32Array,
    timestamp: number,
  ): VADFrame[] {
    const frames: VADFrame[] = [];

    for (
      let offset = 0;
      offset < samples.length;
      offset += this.frameSamples
    ) {
      const frame = samples.subarray(
        offset,
        Math.min(offset + this.frameSamples, samples.length),
      );

      if (frame.length === 0) {
        continue;
      }

      const frameTimestamp =
        timestamp + (offset / this.sampleRate) * 1000;

      const rms = calculateRms(frame);
      const energyDb = 20 * Math.log10(Math.max(rms, 1e-8));
      const zeroCrossingRate = calculateZeroCrossingRate(frame);

      const isSpeech =
        rms >= this.energyThreshold ||
        (
          rms >= this.energyThreshold * 0.55 &&
          zeroCrossingRate <= this.zeroCrossingThreshold
        );

      frames.push({
        timestamp: frameTimestamp,
        durationMs: (frame.length / this.sampleRate) * 1000,
        rms,
        energyDb,
        zeroCrossingRate,
        isSpeech,
      });

      this.updateState(
        frameTimestamp,
        (frame.length / this.sampleRate) * 1000,
        isSpeech,
      );
    }

    return frames;
  }

  public getState(): VADState {
    return this.state;
  }

  public flush(endTimestamp = Date.now()): SpeechSegment | null {
    if (this.state !== "speech" || this.currentSpeechStart == null) {
      this.reset();
      return null;
    }

    const end = Math.max(
      endTimestamp,
      this.lastSpeechTimestamp ?? endTimestamp,
    );

    const segment = this.createSegment(
      this.currentSpeechStart,
      end,
    );

    this.reset();

    return segment;
  }

  public reset(): void {
    this.state = "silence";
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.currentSpeechStart = undefined;
    this.lastSpeechTimestamp = undefined;
  }

  private updateState(
    timestamp: number,
    durationMs: number,
    isSpeech: boolean,
  ): void {
    if (isSpeech) {
      this.speechFrameCount += 1;
      this.silenceFrameCount = 0;

      if (this.state === "silence") {
        if (this.speechFrameCount >= this.speechStartFrames) {
          this.state = "speech";

          this.currentSpeechStart =
            timestamp -
            (this.speechStartFrames - 1) * durationMs;

          this.lastSpeechTimestamp = timestamp + durationMs;
        }
      } else {
        this.lastSpeechTimestamp = timestamp + durationMs;
      }

      return;
    }

    this.speechFrameCount = 0;

    if (this.state !== "speech") {
      return;
    }

    this.silenceFrameCount += 1;

    const silenceDuration =
      this.silenceFrameCount * durationMs;

    if (
      this.silenceFrameCount >= this.speechEndFrames ||
      silenceDuration >= this.maxSilenceDurationMs
    ) {
      const start = this.currentSpeechStart;

      const end =
        this.lastSpeechTimestamp ??
        timestamp;

      if (start != null) {
        const segment = this.createSegment(start, end);

        if (segment) {
          // The segment is available through consumeSegment().
          this.pendingSegments.push(segment);
        }
      }

      this.reset();
    }
  }

  private readonly pendingSegments: SpeechSegment[] = [];

  public consumeSegments(): SpeechSegment[] {
    const result = this.pendingSegments.splice(
      0,
      this.pendingSegments.length,
    );

    return result;
  }

  private createSegment(
    startTime: number,
    endTime: number,
  ): SpeechSegment | null {
    const durationMs = Math.max(0, endTime - startTime);

    if (durationMs < this.minSpeechDurationMs) {
      return null;
    }

    return {
      startTime,
      endTime,
      durationMs,
    };
  }
}

function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;

  for (const sample of samples) {
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples.length);
}

function calculateZeroCrossingRate(
  samples: Float32Array,
): number {
  if (samples.length < 2) {
    return 0;
  }

  let crossings = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];

    if (
      (previous >= 0 && current < 0) ||
      (previous < 0 && current >= 0)
    ) {
      crossings += 1;
    }
  }

  return crossings / (samples.length - 1);
}
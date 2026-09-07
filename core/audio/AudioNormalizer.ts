// core/audio/AudioNormalizer.ts


// core/audio/AudioNormalizer.ts

export interface PCMNormalizationOptions {
  readonly targetPeak?: number;
  readonly removeDCOffset?: boolean;
  readonly highPassCoefficient?: number;
}

export interface NormalizationResult {
  readonly samples: Float32Array;
  readonly originalPeak: number;
  readonly normalizedPeak: number;
  readonly rms: number;
  readonly clippedSamples: number;
}

export class AudioNormalizer {
  private readonly targetPeak: number;
  private readonly removeDCOffset: boolean;
  private readonly highPassCoefficient: number;

  public constructor(options: PCMNormalizationOptions = {}) {
    this.targetPeak = clamp(options.targetPeak ?? 0.95, 0.1, 1);
    this.removeDCOffset = options.removeDCOffset ?? true;
    this.highPassCoefficient = clamp(
      options.highPassCoefficient ?? 0.995,
      0.9,
      0.9999,
    );
  }

  public normalizePCM16(input: Int16Array): NormalizationResult {
    const samples = new Float32Array(input.length);

    for (let index = 0; index < input.length; index += 1) {
      samples[index] = input[index] / 32768;
    }

    return this.normalizeFloat(samples);
  }

  public normalizeFloat(input: Float32Array): NormalizationResult {
    if (input.length === 0) {
      return {
        samples: new Float32Array(),
        originalPeak: 0,
        normalizedPeak: 0,
        rms: 0,
        clippedSamples: 0,
      };
    }

    const samples = new Float32Array(input);

    if (this.removeDCOffset) {
      this.removeDC(samples);
    }

    const originalPeak = calculatePeak(samples);

    if (originalPeak > 0) {
      const gain = Math.min(this.targetPeak / originalPeak, 8);

      for (let index = 0; index < samples.length; index += 1) {
        samples[index] *= gain;
      }
    }

    let clippedSamples = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const before = samples[index];

      samples[index] = clamp(before, -1, 1);

      if (before !== samples[index]) {
        clippedSamples += 1;
      }
    }

    const normalizedPeak = calculatePeak(samples);
    const rms = calculateRms(samples);

    return {
      samples,
      originalPeak,
      normalizedPeak,
      rms,
      clippedSamples,
    };
  }

  public floatToPCM16(samples: Float32Array): Int16Array {
    const output = new Int16Array(samples.length);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = clamp(samples[index], -1, 1);

      output[index] =
        sample < 0
          ? Math.round(sample * 32768)
          : Math.min(32767, Math.round(sample * 32767));
    }

    return output;
  }

  private removeDC(samples: Float32Array): void {
    let previousInput = samples[0] ?? 0;
    let previousOutput = 0;

    for (let index = 0; index < samples.length; index += 1) {
      const input = samples[index];

      const output =
        input - previousInput + this.highPassCoefficient * previousOutput;

      samples[index] = output;

      previousInput = input;
      previousOutput = output;
    }
  }
}

function calculatePeak(samples: Float32Array): number {
  let peak = 0;

  for (const sample of samples) {
    peak = Math.max(peak, Math.abs(sample));
  }

  return peak;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
// core/models/installation/DiskSpaceGuard.ts

import { statfs } from "node:fs/promises";

export interface DiskSpaceGuardOptions {
  readonly safetyBufferBytes?: number;
}

export interface DiskSpaceCheckResult {
  readonly sufficient: boolean;

  readonly freeBytes: number;

  readonly requiredBytes: number;

  readonly safetyBufferBytes: number;

  readonly shortfallBytes: number;
}

const DEFAULT_SAFETY_BUFFER_BYTES = 2 * 1024 ** 3;

export class DiskSpaceGuard {
  private readonly safetyBufferBytes: number;

  public constructor(options: DiskSpaceGuardOptions = {}) {
    this.safetyBufferBytes = Math.max(
      0,
      options.safetyBufferBytes ?? DEFAULT_SAFETY_BUFFER_BYTES,
    );
  }

  public async check(
    directory: string,
    requiredBytes: number,
  ): Promise<DiskSpaceCheckResult> {
    if (!Number.isFinite(requiredBytes) || requiredBytes < 0) {
      throw new Error("requiredBytes must be a non-negative finite number.");
    }

    const stats = await statfs(directory);

    const freeBytes = Number(stats.bavail) * Number(stats.bsize);

    const totalRequired = requiredBytes + this.safetyBufferBytes;

    const shortfallBytes = Math.max(0, totalRequired - freeBytes);

    return Object.freeze({
      sufficient: shortfallBytes === 0,

      freeBytes,

      requiredBytes: totalRequired,

      safetyBufferBytes: this.safetyBufferBytes,

      shortfallBytes,
    });
  }

  public async assertSufficient(
    directory: string,
    requiredBytes: number,
  ): Promise<void> {
    const result = await this.check(directory, requiredBytes);

    if (!result.sufficient) {
      throw new Error(
        `Insufficient disk space. Veyra requires ${result.requiredBytes} bytes including safety buffer, but only ${result.freeBytes} bytes are available.`,
      );
    }
  }
}

// // core/models/installation/MemoryPressureGuard.ts

import {
  freemem,
  totalmem,
} from "node:os";

import type {
  ModelDefinition,
} from "../ModelRegistry";

export interface MemoryPressureGuardOptions {
  readonly minimumSystemAvailableBytes?: number;

  readonly safetyReserveBytes?: number;
}

export interface MemoryPressureResult {
  readonly safe: boolean;

  readonly totalMemoryBytes: number;

  readonly availableMemoryBytes: number;

  readonly safetyReserveBytes: number;

  readonly effectiveAvailableBytes: number;

  readonly requiredMemoryBytes: number;

  readonly shortfallBytes: number;

  readonly pressurePercent: number;
}

const DEFAULT_MINIMUM_AVAILABLE_BYTES =
  2 * 1024 ** 3;

const DEFAULT_SAFETY_RESERVE_BYTES =
  2 * 1024 ** 3;

export class MemoryPressureGuard {
  private readonly minimumSystemAvailableBytes:
    number;

  private readonly safetyReserveBytes:
    number;

  public constructor(
    options: MemoryPressureGuardOptions = {},
  ) {
    this.minimumSystemAvailableBytes =
      Math.max(
        0,
        options
          .minimumSystemAvailableBytes ??
          DEFAULT_MINIMUM_AVAILABLE_BYTES,
      );

    this.safetyReserveBytes =
      Math.max(
        0,
        options.safetyReserveBytes ??
          DEFAULT_SAFETY_RESERVE_BYTES,
      );
  }

  public inspect(
    requiredMemoryBytes: number,
  ): MemoryPressureResult {
    if (
      !Number.isFinite(
        requiredMemoryBytes,
      ) ||
      requiredMemoryBytes < 0
    ) {
      throw new Error(
        "requiredMemoryBytes must be a non-negative finite number.",
      );
    }

    const total =
      totalmem();

    const available =
      freemem();

    const effectiveAvailable =
      Math.max(
        0,
        available -
          this.safetyReserveBytes,
      );

    const required =
      Math.max(
        requiredMemoryBytes,
        this.minimumSystemAvailableBytes,
      );

    const shortfall =
      Math.max(
        0,
        required -
          effectiveAvailable,
      );

    const pressurePercent =
      total > 0
        ? Math.min(
            100,
            Math.max(
              0,
              ((total -
                available) /
                total) *
                100,
            ),
          )
        : 100;

    return Object.freeze({
      safe:
        shortfall === 0,

      totalMemoryBytes:
        total,

      availableMemoryBytes:
        available,

      safetyReserveBytes:
        this.safetyReserveBytes,

      effectiveAvailableBytes:
        effectiveAvailable,

      requiredMemoryBytes:
        required,

      shortfallBytes:
        shortfall,

      pressurePercent,
    });
  }

  public inspectModel(
    model: ModelDefinition,
  ): MemoryPressureResult {
    return this.inspect(
      model.requirements
        .recommendedRamBytes,
    );
  }

  public assertSafeForModel(
    model: ModelDefinition,
  ): void {
    const result =
      this.inspectModel(
        model,
      );

    if (!result.safe) {
      throw new Error(
        `Insufficient currently available memory for "${model.displayName}". Available: ${result.availableMemoryBytes} bytes. Effective safe memory: ${result.effectiveAvailableBytes} bytes. Required: ${result.requiredMemoryBytes} bytes.`,
      );
    }
  }
}
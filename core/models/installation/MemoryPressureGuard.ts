// core/models/installation/MemoryPressureGuard.ts

import { freemem, totalmem } from "node:os";

import type { ModelDefinition } from "../ModelRegistry";

/**
 * ============================================================================
 * Configuration
 * ============================================================================
 *
 * Memory safety is calculated dynamically from the machine's total RAM.
 *
 * Example:
 *
 * 4 GB  -> 0.60 GB reserve
 * 8 GB  -> 1.20 GB reserve
 * 16 GB -> 2.40 GB reserve
 * 32 GB -> 4.80 GB reserve
 * 64 GB -> 9.60 GB reserve
 *
 * This prevents Veyra from hard-coding a fixed reserve such as 2 GB.
 */

const DEFAULT_SAFETY_RESERVE_PERCENT = 15;

const DEFAULT_MINIMUM_SYSTEM_AVAILABLE_PERCENT = 0;

/**
 * ============================================================================
 * Types
 * ============================================================================
 */

export interface MemoryPressureGuardOptions {
  /**
   * Percentage of total physical RAM that Veyra always leaves untouched
   * for Windows and other system activity.
   *
   * Default: 15%.
   */
  readonly safetyReservePercent?: number;

  /**
   * Optional additional absolute reserve.
   *
   * This is intentionally zero by default.
   *
   * It exists for deployments that may want an additional platform-specific
   * reserve later without changing the core algorithm.
   */
  readonly additionalSafetyReserveBytes?: number;

  /**
   * Optional minimum available-memory percentage.
   *
   * Default: 0%.
   *
   * The main protection comes from safetyReservePercent.
   */
  readonly minimumSystemAvailablePercent?: number;
}

export interface MemoryPressureResult {
  readonly safe: boolean;

  readonly totalMemoryBytes: number;

  readonly availableMemoryBytes: number;

  readonly safetyReservePercent: number;

  readonly safetyReserveBytes: number;

  readonly additionalSafetyReserveBytes: number;

  readonly totalReservedBytes: number;

  readonly effectiveAvailableBytes: number;

  readonly requiredMemoryBytes: number;

  readonly shortfallBytes: number;

  readonly pressurePercent: number;

  readonly availablePercent: number;

  readonly effectiveAvailablePercent: number;

  readonly minimumSystemAvailableBytes: number;

  readonly minimumSystemAvailablePercent: number;
}

/**
 * ============================================================================
 * Helpers
 * ============================================================================
 */

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

/**
 * ============================================================================
 * MemoryPressureGuard
 * ============================================================================
 */

export class MemoryPressureGuard {
  private readonly safetyReservePercent: number;

  private readonly additionalSafetyReserveBytes: number;

  private readonly minimumSystemAvailablePercent: number;

  public constructor(options: MemoryPressureGuardOptions = {}) {
    this.safetyReservePercent = clampPercent(
      options.safetyReservePercent ?? DEFAULT_SAFETY_RESERVE_PERCENT,
    );

    this.additionalSafetyReserveBytes = Math.max(
      0,
      Math.floor(options.additionalSafetyReserveBytes ?? 0),
    );

    this.minimumSystemAvailablePercent = clampPercent(
      options.minimumSystemAvailablePercent ??
        DEFAULT_MINIMUM_SYSTEM_AVAILABLE_PERCENT,
    );
  }

  /**
   * Inspect current system memory.
   *
   * IMPORTANT:
   *
   * This method intentionally uses current OS-level available memory rather
   * than the amount of RAM consumed by Veyra alone.
   *
   * This means Chrome, VS Code, antivirus, browsers, Docker, etc. are already
   * represented in the operating system's available-memory value.
   */
  public inspect(requiredMemoryBytes: number): MemoryPressureResult {
    if (!Number.isFinite(requiredMemoryBytes) || requiredMemoryBytes < 0) {
      throw new Error(
        "requiredMemoryBytes must be a non-negative finite number.",
      );
    }

    const total = Math.max(0, totalmem());

    const available = Math.max(0, freemem());

    const safetyReserve = Math.floor(total * (this.safetyReservePercent / 100));

    const minimumSystemAvailable = Math.floor(
      total * (this.minimumSystemAvailablePercent / 100),
    );

    /*
     * The effective reserve is:
     *
     *   percentage reserve
     *   +
     *   optional additional reserve
     *
     * The minimum system available amount is also considered.
     */
    const totalReserved = safetyReserve + this.additionalSafetyReserveBytes;

    const effectiveAvailableBeforeMinimum = Math.max(
      0,
      available - totalReserved,
    );

    const effectiveAvailable = Math.max(
      0,
      effectiveAvailableBeforeMinimum - minimumSystemAvailable,
    );

    /*
     * The required memory is now the memory the model actually needs to
     * operate, not the model's recommended headroom.
     *
     * Model requirements should provide:
     *
     *   minimumRamBytes
     *   recommendedRamBytes
     *
     * The minimum is used for a hard safety decision.
     */
    const required = Math.max(0, requiredMemoryBytes);

    const shortfall = Math.max(0, required - effectiveAvailable);

    const pressurePercent =
      total > 0 ? clampPercent(((total - available) / total) * 100) : 100;

    const availablePercent =
      total > 0 ? clampPercent((available / total) * 100) : 0;

    const effectiveAvailablePercent =
      total > 0 ? clampPercent((effectiveAvailable / total) * 100) : 0;

    return Object.freeze({
      safe: shortfall === 0,

      totalMemoryBytes: total,

      availableMemoryBytes: available,

      safetyReservePercent: this.safetyReservePercent,

      safetyReserveBytes: safetyReserve,

      additionalSafetyReserveBytes: this.additionalSafetyReserveBytes,

      totalReservedBytes: totalReserved,

      effectiveAvailableBytes: effectiveAvailable,

      requiredMemoryBytes: required,

      shortfallBytes: shortfall,

      pressurePercent,

      availablePercent,

      effectiveAvailablePercent,

      minimumSystemAvailableBytes: minimumSystemAvailable,

      minimumSystemAvailablePercent: this.minimumSystemAvailablePercent,
    });
  }

  /**
   * Inspect memory required to actually load a model.
   *
   * We deliberately use minimumRamBytes here.
   *
   * recommendedRamBytes remains useful for:
   *
   * - UI recommendations
   * - model ranking
   * - performance guidance
   * - warnings
   *
   * It is not used as the hard "can this model load?" threshold.
   */
  public inspectModel(model: ModelDefinition): MemoryPressureResult {
    return this.inspect(Math.max(0, model.requirements.minimumRamBytes));
  }

  /**
   * Assert that the model can safely be loaded right now.
   */
  public assertSafeForModel(model: ModelDefinition): void {
    const result = this.inspectModel(model);

    if (!result.safe) {
      throw new Error(
        `Insufficient currently available memory for "${model.displayName}". ` +
          `Available: ${result.availableMemoryBytes} bytes. ` +
          `Dynamic safety reserve: ${result.totalReservedBytes} bytes ` +
          `(${result.safetyReservePercent}% of total RAM plus additional reserve). ` +
          `Effective available memory: ${result.effectiveAvailableBytes} bytes. ` +
          `Required: ${result.requiredMemoryBytes} bytes. ` +
          `Shortfall: ${result.shortfallBytes} bytes.`,
      );
    }
  }
}

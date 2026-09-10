// desktop/services/ai/HardwareService.ts

/**
 * Veyra Hardware Service
 *
 * Electron MAIN-PROCESS ONLY.
 *
 * Responsibility:
 *
 * HardwareProfiler
 *       ↓
 * HardwareService
 *       ↓
 * ModelManager
 *       ↓
 * ModelSelector
 *
 * This service creates the boundary between:
 *
 *     core hardware domain types
 *
 * and
 *
 *     renderer-safe shared DTOs.
 *
 * The renderer never receives the core HardwareProfile
 * or ModelSelectionPlan directly.
 */

import { HardwareProfiler } from "../../../core/hardware/HardwareProfiler";

import type { HardwareProfile } from "../../../core/hardware/HardwareProfile";

import { ModelManager } from "../../../core/models/ModelManager";

import type {
  ModelSelectionOptions,
  ModelSelectionPlan,
} from "../../../core/models/ModelSelector";

import type {
  HardwareModelPlan,
  HardwareSnapshotResponse,
  SharedAccelerationBackend,
} from "../../../shared/types/hardware";

/**
 * Renderer-safe acceleration backend allow-list.
 */
const SHARED_ACCELERATION_BACKENDS = new Set<SharedAccelerationBackend>([
  "cpu",
  "cuda",
  "metal",
  "vulkan",
  "directml",
]);

/**
 * Renderer-safe model modalities.
 */
type SharedModelModality = "llm" | "stt" | "vision" | "tts";

/**
 * Explicit runtime validation for model modalities.
 */
function isSharedModelModality(value: string): value is SharedModelModality {
  return (
    value === "llm" || value === "stt" || value === "vision" || value === "tts"
  );
}

/**
 * Converts core acceleration backend strings
 * into renderer-safe shared acceleration backends.
 */
function toSharedAccelerationBackends(
  backends: readonly string[],
): readonly SharedAccelerationBackend[] {
  return Object.freeze(
    backends.filter((backend): backend is SharedAccelerationBackend =>
      SHARED_ACCELERATION_BACKENDS.has(backend as SharedAccelerationBackend),
    ),
  );
}

/**
 * Converts the main-process HardwareProfile
 * into the renderer-safe shared DTO.
 */
function toSharedHardwareProfile(
  profile: HardwareProfile,
): HardwareSnapshotResponse["profile"] {
  return Object.freeze({
    ...profile,

    acceleration: Object.freeze({
      ...profile.acceleration,

      availableBackends: toSharedAccelerationBackends(
        profile.acceleration.availableBackends,
      ),
    }),
  });
}

/**
 * Creates a renderer-safe model plan.
 */
function freezePlan(plan: ModelSelectionPlan): HardwareModelPlan {
  const primary: Record<SharedModelModality, string | undefined> = {
    llm: undefined,
    stt: undefined,
    vision: undefined,
    tts: undefined,
  };

  const fallbacks: Record<SharedModelModality, readonly string[]> = {
    llm: [],
    stt: [],
    vision: [],
    tts: [],
  };

  for (const group of plan.groups) {
    const modality = String(group.modality);

    if (!isSharedModelModality(modality)) {
      continue;
    }

    if (group.primary) {
      primary[modality] = group.primary.model.id;
    }

    fallbacks[modality] = Object.freeze(
      group.fallbacks.map((model) => model.model.id),
    );
  }

  const readonlyPrimary: HardwareModelPlan["primary"] = Object.freeze({
    llm: primary.llm,
    stt: primary.stt,
    vision: primary.vision,
    tts: primary.tts,
  });

  const readonlyFallbacks: HardwareModelPlan["fallbacks"] = Object.freeze({
    llm: fallbacks.llm,
    stt: fallbacks.stt,
    vision: fallbacks.vision,
    tts: fallbacks.tts,
  });

  return Object.freeze({
    generatedAt: Date.now(),

    hardwareTier: plan.hardwareTier,

    primary: readonlyPrimary,

    fallbacks: readonlyFallbacks,
  });
}

export interface HardwareServiceOptions {
  /**
   * Existing production ModelManager.
   *
   * This is the preferred path.
   */
  readonly modelManager?: ModelManager;

  /**
   * Optional model-selection configuration.
   *
   * Used only when a ModelManager is not
   * injected by the application composition root.
   */
  readonly modelSelection?: ModelSelectionOptions;

  /**
   * Legacy compatibility only.
   *
   * Model paths are now owned by ModelSystem,
   * ModelPaths and ModelStorage.
   *
   * This value is intentionally not used to
   * construct ModelManager.
   */
  readonly modelDirectory?: string;
}

export class HardwareService {
  private readonly profiler: HardwareProfiler;

  private readonly modelManager: ModelManager;

  private profileCache: HardwareProfile | null = null;

  private profilePromise: Promise<HardwareProfile> | null = null;

  private selectionPlan: ModelSelectionPlan | null = null;

  public constructor(options: HardwareServiceOptions = {}) {
    this.profiler = new HardwareProfiler();

    /*
     * Production Electron startup injects
     * the ModelSystem-owned ModelManager.
     *
     * The fallback constructor keeps this
     * service independently usable in tests
     * or transitional code.
     */
    this.modelManager =
      options.modelManager ??
      new ModelManager({
        selection: options.modelSelection,
      });

    /*
     * Explicitly retain the old option only
     * for source compatibility. The model system,
     * not HardwareService, owns filesystem layout.
     */
    void options.modelDirectory;
  }

  /**
   * Returns the current hardware profile.
   */
  public async getProfile(forceRefresh = false): Promise<HardwareProfile> {
    if (!forceRefresh && this.profileCache) {
      return this.profileCache;
    }

    if (!forceRefresh && this.profilePromise) {
      return this.profilePromise;
    }

    this.profilePromise = this.profiler.profile();

    try {
      const profile = await this.profilePromise;

      this.profileCache = profile;

      return profile;
    } finally {
      this.profilePromise = null;
    }
  }

  /**
   * Forces fresh hardware detection.
   */
  public async refresh(): Promise<HardwareProfile> {
    this.profileCache = null;
    this.selectionPlan = null;

    const profile = await this.profiler.refresh();

    this.profileCache = profile;

    return profile;
  }

  /**
   * Returns a renderer-safe hardware snapshot.
   */
  public async getSnapshot(
    forceRefresh = false,
  ): Promise<HardwareSnapshotResponse> {
    const profile = await this.getProfile(forceRefresh);

    return Object.freeze({
      profile: toSharedHardwareProfile(profile),
    });
  }

  /**
   * Generates the hardware-aware
   * model-selection plan.
   */
  public async getModelPlan(forceRefresh = false): Promise<{
    readonly profile: HardwareProfile;
    readonly plan: ModelSelectionPlan;
  }> {
    const profile = await this.getProfile(forceRefresh);

    if (!forceRefresh && this.selectionPlan) {
      return Object.freeze({
        profile,
        plan: this.selectionPlan,
      });
    }

    const plan = this.modelManager.createSelectionPlan(profile);

    this.selectionPlan = plan;

    return Object.freeze({
      profile,
      plan,
    });
  }

  /**
   * Returns a renderer-safe model-selection plan.
   */
  public async getSafeModelPlan(forceRefresh = false): Promise<{
    readonly profile: HardwareSnapshotResponse["profile"];

    readonly plan: HardwareModelPlan;
  }> {
    const result = await this.getModelPlan(forceRefresh);

    return Object.freeze({
      profile: toSharedHardwareProfile(result.profile),

      plan: freezePlan(result.plan),
    });
  }

  /**
   * Returns the connected ModelManager
   * for trusted Electron main-process code.
   *
   * NEVER expose this through preload.
   */
  public getModelManager(): ModelManager {
    return this.modelManager;
  }

  public clearCache(): void {
    this.profileCache = null;
    this.selectionPlan = null;
  }
}

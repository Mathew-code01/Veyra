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
import { statfs } from "node:fs/promises";

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
import type { HardwareAssessmentResponse, LocalModelAssessment } from "../../../shared/types/hardware";

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
  readonly modelStoragePath?: string;
}

export class HardwareService {
  private readonly profiler: HardwareProfiler;

  private readonly modelManager: ModelManager;
  private readonly modelStoragePath?: string;

  private profileCache: HardwareProfile | null = null;

  private profilePromise: Promise<HardwareProfile> | null = null;

  private selectionPlan: ModelSelectionPlan | null = null;

  public constructor(options: HardwareServiceOptions = {}) {
    this.profiler = new HardwareProfiler();
    this.modelStoragePath = options.modelStoragePath;

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

  private async getProfileWithModelStorage(forceRefresh = false): Promise<HardwareProfile> {
    const detectedProfile = await this.getProfile(forceRefresh);
    if (!this.modelStoragePath) return detectedProfile;
    try {
      const fs = await statfs(this.modelStoragePath);
      const totalBytes = Number(fs.blocks * fs.bsize);
      const freeBytes = Number(fs.bavail * fs.bsize);
      if (Number.isFinite(totalBytes) && Number.isFinite(freeBytes) && totalBytes > 0 && freeBytes >= 0) {
        return Object.freeze({ ...detectedProfile, storage: Object.freeze({ ...detectedProfile.storage, totalBytes, freeBytes, usedBytes: Math.max(0, totalBytes - freeBytes), freeGB: freeBytes / 1024 ** 3 }) });
      }
    } catch {
      // Keep the profiler's system-volume reading when model storage cannot be inspected.
    }
    return detectedProfile;
  }

  /**
   * Returns a renderer-safe hardware snapshot.
   */
  public async getSnapshot(
    forceRefresh = false,
  ): Promise<HardwareSnapshotResponse> {
    const profile = await this.getProfileWithModelStorage(forceRefresh);

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
    const profile = await this.getProfileWithModelStorage(forceRefresh);

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

  /** Explainable, local-only assessment sourced from the existing profiler and registry. */
  public async getAssessment(forceRefresh = false): Promise<HardwareAssessmentResponse> {
    const profile = await this.getProfileWithModelStorage(forceRefresh);
    const manager = this.modelManager;
    const installed = new Set(manager.listInstalled().map((model) => model.modelId));
    // Hardware remains useful when an optional local runtime failed to load.
    // Keep the hardware/catalog assessment available and report that no
    // runtime is ready instead of rejecting the entire IPC contract.
    let runtimeNames: readonly string[] = [];
    try {
      runtimeNames = manager.listRuntimes();
    } catch {
      runtimeNames = [];
    }
    const models: LocalModelAssessment[] = manager.listAvailableModels()
      .filter((model) => model.modality !== "embedding")
      .map((model) => {
        const compatibility = manager.evaluateModel(model.id, profile);
        const isInstalled = installed.has(model.id);
        const artifact = model.package?.artifacts.find((item) => item.role === "model") ?? model.artifact;
        const canLoad = compatibility.level !== "incompatible" && model.availability === "available";
        const benchmark = manager.getBenchmark(model.id);
        const limitations = [...compatibility.warnings, ...compatibility.blockingReasons];
        if (!manager.supportsModel(model.id)) limitations.push(`The ${model.runtime} runtime is not currently registered.`);
        if (!benchmark) limitations.push("Inference speed has not been measured on this computer.");
        const classification = !canLoad ? "unsupported" : compatibility.level === "compatible" && compatibility.score >= 85 && profile.systemLoad.cpuUsagePercent < 75 && profile.memory.availableBytes >= model.requirements.recommendedRamBytes ? "highly_recommended" : compatibility.level === "compatible_with_warning" || compatibility.score < 85 ? "supported_with_limitations" : "not_recommended";
        return Object.freeze({
          modelId: model.id, name: model.displayName, modality: model.modality as LocalModelAssessment["modality"], runtime: model.runtime,
          quantization: model.quantization, version: model.version, classification, canLoad,
          canRunAcceptably: null,
          supportsConcurrentWorkload: null, installed: isInstalled, ready: isInstalled && benchmark?.metrics.success === true, measuredPerformance: Boolean(benchmark?.metrics.success),
          minimumRamBytes: model.requirements.minimumRamBytes, recommendedRamBytes: model.requirements.recommendedRamBytes,
          minimumVramBytes: model.requirements.minimumVramBytes, estimatedDiskBytes: model.requirements.estimatedDiskBytes,
          artifact: artifact && artifact.sizeBytes > 0 && /^[a-f0-9]{64}$/i.test(artifact.sha256) ? { url: artifact.url, filename: artifact.filename, sizeBytes: artifact.sizeBytes, sha256: artifact.sha256 } : undefined,
          license: { name: model.license.name, url: model.license.url, commercialUse: model.license.commercialUse, notes: model.license.notes },
          reasons: Object.freeze([...compatibility.reasons]), limitations: Object.freeze(limitations),
        });
      });
    return Object.freeze({ profile: toSharedHardwareProfile(profile), models: Object.freeze(models), localRuntimeReady: runtimeNames.length > 0, runtimeNames: Object.freeze([...runtimeNames]) });
  }

  public clearCache(): void {
    this.profileCache = null;
    this.selectionPlan = null;
  }
}

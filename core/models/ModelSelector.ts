// Relative path: core/models/ModelSelector.ts

import type { HardwareProfile } from "../hardware/HardwareProfile";
import {
  defaultModelRegistry,
  type ModelDefinition,
  type ModelModality,
} from "./ModelRegistry";
import {
  ModelCompatibility,
  type ModelCompatibilityResult,
} from "./ModelCompatibility";

export interface SelectedModel {
  readonly model: ModelDefinition;
  readonly compatibility: ModelCompatibilityResult;
  readonly role: "primary" | "fallback";
  readonly rank: number;
}

export interface ModelSelectionGroup {
  readonly modality: ModelModality;
  readonly primary: SelectedModel | null;
  readonly fallbacks: readonly SelectedModel[];
}

export interface ModelSelectionPlan {
  readonly generatedAt: number;
  readonly hardwareTier: HardwareProfile["tier"];
  readonly groups: readonly ModelSelectionGroup[];
  readonly allCompatibleModels: readonly SelectedModel[];
}

export interface ModelSelectionOptions {
  readonly fallbackCount?: number;
  readonly allowWarnings?: boolean;
  readonly preferredModels?: Partial<Record<ModelModality, readonly string[]>>;
}

const DEFAULT_FALLBACK_COUNT = 3;

const MODALITIES: readonly ModelModality[] = ["llm", "stt", "vision", "tts"];

function getLatencyScore(model: ModelDefinition): number {
  switch (model.performance.latencyClass) {
    case "ultra_low":
      return 100;
    case "low":
      return 85;
    case "balanced":
      return 65;
    case "high":
      return 40;
    default:
      return 0;
  }
}

function getQualityScore(model: ModelDefinition): number {
  switch (model.performance.qualityClass) {
    case "basic":
      return 40;
    case "good":
      return 65;
    case "high":
      return 85;
    case "excellent":
      return 100;
    default:
      return 0;
  }
}

export class ModelSelector {
  private readonly compatibility: ModelCompatibility;

  public constructor(
    private readonly registry = defaultModelRegistry,
    compatibility = new ModelCompatibility(),
  ) {
    this.compatibility = compatibility;
  }

  public select(
    profile: HardwareProfile,
    options: ModelSelectionOptions = {},
  ): ModelSelectionPlan {
    const fallbackCount = Math.max(
      0,
      options.fallbackCount ?? DEFAULT_FALLBACK_COUNT,
    );

    const groups = MODALITIES.map((modality) =>
      this.selectForModality(modality, profile, fallbackCount, options),
    );

    const allCompatibleModels = groups.flatMap((group) => {
      const values: SelectedModel[] = [];

      if (group.primary) {
        values.push(group.primary);
      }

      values.push(...group.fallbacks);

      return values;
    });

    return Object.freeze({
      generatedAt: Date.now(),
      hardwareTier: profile.tier,
      groups,
      allCompatibleModels,
    });
  }

  public selectForModality(
    modality: ModelModality,
    profile: HardwareProfile,
    fallbackCount = DEFAULT_FALLBACK_COUNT,
    options: ModelSelectionOptions = {},
  ): ModelSelectionGroup {
    const candidates = this.registry
      .listByModality(modality)
      .filter((model) => model.availability === "available")
      .map((model) => ({
        model,
        compatibility: this.compatibility.evaluate(model, profile),
      }))
      .filter(({ compatibility }) => {
        if (compatibility.level === "compatible") {
          return true;
        }

        return (
          options.allowWarnings === true &&
          compatibility.level === "compatible_with_warning"
        );
      });

    const preferredIds = options.preferredModels?.[modality] ?? [];

    const ranked = [...candidates].sort((a, b) => {
      const aPreferred = preferredIds.indexOf(a.model.id);
      const bPreferred = preferredIds.indexOf(b.model.id);

      if (aPreferred !== -1 || bPreferred !== -1) {
        if (aPreferred === -1) {
          return 1;
        }

        if (bPreferred === -1) {
          return -1;
        }

        return aPreferred - bPreferred;
      }

      const aScore = this.calculateSelectionScore(
        a.model,
        a.compatibility.score,
      );

      const bScore = this.calculateSelectionScore(
        b.model,
        b.compatibility.score,
      );

      return bScore - aScore;
    });

    const selected = ranked.slice(0, fallbackCount + 1);

    const primaryCandidate = selected[0];

    const primary = primaryCandidate
      ? Object.freeze({
          model: primaryCandidate.model,
          compatibility: primaryCandidate.compatibility,
          role: "primary" as const,
          rank: 1,
        })
      : null;

    const fallbacks = selected.slice(1).map((candidate, index) =>
      Object.freeze({
        model: candidate.model,
        compatibility: candidate.compatibility,
        role: "fallback" as const,
        rank: index + 2,
      }),
    );

    return Object.freeze({
      modality,
      primary,
      fallbacks,
    });
  }

  private calculateSelectionScore(
    model: ModelDefinition,
    compatibilityScore: number,
  ): number {
    const latencyScore = getLatencyScore(model);
    const qualityScore = getQualityScore(model);

    /*
     * Veyra is latency-first.
     *
     * Compatibility remains the strongest constraint.
     * After compatibility, latency receives more weight than quality.
     */

    const score =
      compatibilityScore * 0.5 +
      latencyScore * 0.3 +
      qualityScore * 0.15 +
      model.priority * 0.05;

    return score;
  }

  public getRecommendedModel(
    modality: ModelModality,
    profile: HardwareProfile,
  ): ModelDefinition | null {
    return this.selectForModality(modality, profile, 0).primary?.model ?? null;
  }
}

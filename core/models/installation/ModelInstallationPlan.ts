// core/models/installation/ModelInstallationPlan.ts

import type { HardwareProfile } from "../../hardware/HardwareProfile";

import type { ModelDefinition } from "../ModelRegistry";

import {
  ModelInstallationPolicy,
  type ModelInstallationDecision,
} from "./ModelInstallationPolicy";

export interface ModelInstallationPlanItem {
  readonly model: ModelDefinition;

  readonly decision: ModelInstallationDecision;

  readonly estimatedDiskBytes: number;
}

export interface ModelInstallationPlan {
  readonly generatedAt: number;

  readonly hardwareTier: HardwareProfile["tier"];

  readonly items: readonly ModelInstallationPlanItem[];

  readonly required: readonly ModelInstallationPlanItem[];

  readonly recommended: readonly ModelInstallationPlanItem[];

  readonly optional: readonly ModelInstallationPlanItem[];

  readonly onDemand: readonly ModelInstallationPlanItem[];

  readonly manual: readonly ModelInstallationPlanItem[];

  readonly notInstallable: readonly ModelInstallationPlanItem[];

  readonly requiredBytes: number;

  readonly recommendedBytes: number;

  readonly optionalBytes: number;

  readonly totalPotentialBytes: number;
}

export interface BuildModelInstallationPlanOptions {
  readonly requiredModelIds?: readonly string[];

  readonly preferredModelIds?: readonly string[];

  readonly optionalModelIds?: readonly string[];
}

export function buildModelInstallationPlan(
  profile: HardwareProfile,
  models: readonly ModelDefinition[],
  options: BuildModelInstallationPlanOptions = {},
): ModelInstallationPlan {
  const policy = new ModelInstallationPolicy({
    requiredModelIds: options.requiredModelIds,

    preferredModelIds: options.preferredModelIds,

    optionalModelIds: options.optionalModelIds,
  });

  const items = models.map((model) => {
    const decision = policy.decide(model, profile);

    return Object.freeze({
      model,

      decision,

      estimatedDiskBytes: policy.getEstimatedDiskBytes(model),
    });
  });

  const required = items.filter(
    (item) => item.decision.disposition === "required",
  );

  const recommended = items.filter(
    (item) => item.decision.disposition === "recommended",
  );

  const optional = items.filter(
    (item) => item.decision.disposition === "optional",
  );

  const onDemand = items.filter(
    (item) => item.decision.disposition === "on_demand",
  );

  const manual = items.filter((item) => item.decision.disposition === "manual");

  const notInstallable = items.filter(
    (item) => item.decision.disposition === "not_installable",
  );

  const sum = (group: readonly ModelInstallationPlanItem[]): number =>
    group.reduce((total, item) => total + item.estimatedDiskBytes, 0);

  return Object.freeze({
    generatedAt: Date.now(),

    hardwareTier: profile.tier,

    items: Object.freeze(items),

    required: Object.freeze(required),

    recommended: Object.freeze(recommended),

    optional: Object.freeze(optional),

    onDemand: Object.freeze(onDemand),

    manual: Object.freeze(manual),

    notInstallable: Object.freeze(notInstallable),

    requiredBytes: sum(required),

    recommendedBytes: sum(recommended),

    optionalBytes: sum(optional),

    totalPotentialBytes: sum(items),
  });
}

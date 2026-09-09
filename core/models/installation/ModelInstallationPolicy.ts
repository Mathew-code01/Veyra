// 

// core/models/installation/ModelInstallationPolicy.ts

import type {
  HardwareProfile,
} from "../../hardware/HardwareProfile";

import type {
  ModelDefinition,
} from "../ModelRegistry";

export type InstallationDisposition =
  | "required"
  | "recommended"
  | "optional"
  | "on_demand"
  | "manual"
  | "not_installable";

export interface ModelInstallationDecision {
  readonly modelId: string;

  readonly disposition:
    InstallationDisposition;

  readonly reasons:
    readonly string[];
}

export interface ModelInstallationPolicyOptions {
  readonly automaticDownloadMaxBytes?: number;

  readonly lowMemoryVisionOnDemandBytes?: number;

  readonly preferredModelIds?:
    readonly string[];

  readonly requiredModelIds?:
    readonly string[];

  readonly optionalModelIds?:
    readonly string[];
}

const DEFAULT_AUTOMATIC_DOWNLOAD_MAX_BYTES =
  12 * 1024 ** 3;

const DEFAULT_LOW_MEMORY_VISION_BYTES =
  8 * 1024 ** 3;

export class ModelInstallationPolicy {
  private readonly options:
    Required<
      Pick<
        ModelInstallationPolicyOptions,
        | "automaticDownloadMaxBytes"
        | "lowMemoryVisionOnDemandBytes"
      >
    > &
    Omit<
      ModelInstallationPolicyOptions,
      | "automaticDownloadMaxBytes"
      | "lowMemoryVisionOnDemandBytes"
    >;

  public constructor(
    options: ModelInstallationPolicyOptions = {},
  ) {
    this.options = {
      automaticDownloadMaxBytes:
        Math.max(
          0,
          options
            .automaticDownloadMaxBytes ??
            DEFAULT_AUTOMATIC_DOWNLOAD_MAX_BYTES,
        ),

      lowMemoryVisionOnDemandBytes:
        Math.max(
          0,
          options
            .lowMemoryVisionOnDemandBytes ??
            DEFAULT_LOW_MEMORY_VISION_BYTES,
        ),

      preferredModelIds:
        options.preferredModelIds,

      requiredModelIds:
        options.requiredModelIds,

      optionalModelIds:
        options.optionalModelIds,
    };
  }

  public decide(
    model: ModelDefinition,
    profile: HardwareProfile,
  ): ModelInstallationDecision {
    const reasons: string[] = [];

    if (
      !model.artifact
    ) {
      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "not_installable",

        reasons: Object.freeze([
          "No downloadable artifact is currently configured.",
        ]),
      });
    }

    if (
      model.availability !==
      "available"
    ) {
      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "not_installable",

        reasons: Object.freeze([
          `Model availability is "${model.availability}".`,
        ]),
      });
    }

    if (
      model.modality ===
        "vision" &&
      profile.memory.totalBytes <
        this.options
          .lowMemoryVisionOnDemandBytes
    ) {
      reasons.push(
        "Vision is configured as on-demand on memory-constrained systems.",
      );

      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "on_demand",

        reasons:
          Object.freeze(
            reasons,
          ),
      });
    }

    if (
      this.options.requiredModelIds?.includes(
        model.id,
      )
    ) {
      reasons.push(
        "Explicitly selected as required.",
      );

      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "required",

        reasons:
          Object.freeze(
            reasons,
          ),
      });
    }

    if (
      this.options.preferredModelIds?.includes(
        model.id,
      )
    ) {
      reasons.push(
        "Selected by the current hardware-aware model preference.",
      );

      if (
        this.getEstimatedDiskBytes(
          model,
        ) <=
        this.options
          .automaticDownloadMaxBytes
      ) {
        return Object.freeze({
          modelId:
            model.id,

          disposition:
            "recommended",

          reasons:
            Object.freeze(
              reasons,
            ),
        });
      }

      reasons.push(
        "The preferred model is large enough that Veyra should not download it automatically.",
      );

      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "optional",

        reasons:
          Object.freeze(
            reasons,
          ),
      });
    }

    if (
      this.options.optionalModelIds?.includes(
        model.id,
      )
    ) {
      reasons.push(
        "Explicitly configured as optional.",
      );

      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "optional",

        reasons:
          Object.freeze(
            reasons,
          ),
      });
    }

    if (
      model.enabledByDefault &&
      this.getEstimatedDiskBytes(
        model,
      ) <=
        this.options
          .automaticDownloadMaxBytes
    ) {
      reasons.push(
        "Model is enabled by default and is within the automatic-download budget.",
      );

      return Object.freeze({
        modelId:
          model.id,

        disposition:
          "recommended",

        reasons:
          Object.freeze(
            reasons,
          ),
      });
    }

    reasons.push(
      "Model requires user-controlled installation or a later download phase.",
    );

    return Object.freeze({
      modelId:
        model.id,

      disposition:
        "manual",

      reasons:
        Object.freeze(
          reasons,
        ),
    });
  }

  public getEstimatedDiskBytes(
    model: ModelDefinition,
  ): number {
    return Math.max(
      0,
      model.artifact
        ?.sizeBytes ??
        model.requirements
          .estimatedDiskBytes,
    );
  }
}
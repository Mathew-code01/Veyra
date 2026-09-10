// core/models/storage/ModelRecoveryService.ts

import { promises as fs } from "node:fs";

import type { ModelDefinition } from "../ModelRegistry";

import { ModelStorage } from "./ModelStorage";

import { ModelPaths } from "./ModelPaths";

export type ModelRecoveryStatus =
  "healthy" | "recovered" | "missing" | "corrupt" | "partial" | "untracked";

export interface ModelRecoveryResult {
  readonly modelId: string;

  readonly status: ModelRecoveryStatus;

  readonly message: string;
}

export class ModelRecoveryService {
  public constructor(
    private readonly options: {
      readonly storage: ModelStorage;
      readonly paths: ModelPaths;
    },
  ) {}

  public async recover(model: ModelDefinition): Promise<ModelRecoveryResult> {
    await this.options.storage.cleanupTransactionFiles(model);

    const manifest = await this.options.storage.readManifest(model);

    const artifactExists = await this.exists(
      this.options.storage.getArtifactPath(
        model,
        model.artifact?.filename ?? "unknown",
      ),
    );

    const partialExists = model.artifact
      ? await this.exists(
          this.options.storage.getPartialArtifactPath(
            model,
            model.artifact.filename,
          ),
        )
      : false;

    if (manifest) {
      const integrity = await this.options.storage.verifyModel(model);

      if (integrity.status === "valid") {
        return Object.freeze({
          modelId: model.id,

          status: "healthy",

          message: "Installed model verified successfully.",
        });
      }

      if (partialExists) {
        return Object.freeze({
          modelId: model.id,

          status: "partial",

          message: "A partial download exists and can be resumed.",
        });
      }

      await this.options.storage.markCorrupt(model);

      return Object.freeze({
        modelId: model.id,

        status: "corrupt",

        message:
          integrity.reason ?? "Installed model failed integrity verification.",
      });
    }

    if (artifactExists) {
      const adopted = await this.options.storage.adoptVerifiedArtifact(model);

      if (adopted) {
        return Object.freeze({
          modelId: model.id,

          status: "recovered",

          message:
            "A fully downloaded artifact was verified and recovered after an interrupted installation transaction.",
        });
      }

      return Object.freeze({
        modelId: model.id,

        status: "untracked",

        message:
          "An artifact exists without a valid manifest and could not be safely adopted.",
      });
    }

    if (partialExists) {
      return Object.freeze({
        modelId: model.id,

        status: "partial",

        message: "A partial model download is available for resume.",
      });
    }

    return Object.freeze({
      modelId: model.id,

      status: "missing",

      message: "No verified model installation exists.",
    });
  }

  public async recoverAll(
    models: readonly ModelDefinition[],
  ): Promise<readonly ModelRecoveryResult[]> {
    const results: ModelRecoveryResult[] = [];

    for (const model of models) {
      results.push(await this.recover(model));
    }

    return Object.freeze(results);
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
  }
}

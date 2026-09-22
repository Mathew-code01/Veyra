// ============================================================================
// FILE: core/vision/providers/VisionProvider.ts
//
// PURPOSE:
// Provider-neutral Vision model boundary.
//
// Vision knows:
//     "I need visual understanding."
//
// Vision does NOT know:
//     Gemini
//     Mistral
//     Groq
//     OpenRouter
//     API keys
//     HTTP
//     provider URLs
//
// Those responsibilities belong to core/ai and core/cloud.
// ============================================================================

import { VisionError } from "../errors/VisionError";

import type {
  VisionDetailLevel,
  VisionImage,
  VisionObservation,
  VisionObject,
  VisionTextBlock,
  VisionProviderMetadata,
} from "../contracts/VisionTypes";

export interface VisionProviderCapabilities {
  readonly vision: boolean;
  readonly textGeneration?: boolean;
  readonly structuredOutput?: boolean;
  readonly streaming?: boolean;
  readonly local?: boolean;
}

export interface VisionProviderRequest {
  readonly image: VisionImage;
  readonly prompt?: string;
  readonly question?: string;
  readonly detail?: VisionDetailLevel;
  readonly language?: string;
  readonly modelName?: string;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionResponse {
  readonly description: string;

  readonly observations?: readonly VisionObservation[];

  readonly objects?: readonly VisionObject[];

  readonly textBlocks?: readonly VisionTextBlock[];

  readonly confidence?: number;

  readonly provider?: VisionProviderMetadata;

  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VisionProvider {
  readonly name: string;

  readonly capabilities: VisionProviderCapabilities;

  analyze(request: VisionProviderRequest): Promise<VisionResponse>;

  healthCheck?(signal?: AbortSignal): Promise<boolean>;
}

export function assertVisionProvider(provider: VisionProvider): void {
  if (!provider) {
    throw VisionError.invalidRequest("Vision provider is required.");
  }

  if (!provider.name?.trim()) {
    throw VisionError.invalidRequest("Vision provider name is required.");
  }

  if (!provider.capabilities?.vision) {
    throw new VisionError(
      "VISION_CONFIGURATION_ERROR",
      `Vision provider "${provider.name}" does not advertise vision capability.`,
      {
        details: {
          stage: "provider",
          providerName: provider.name,
        },
      },
    );
  }

  if (typeof provider.analyze !== "function") {
    throw new VisionError(
      "VISION_CONFIGURATION_ERROR",
      `Vision provider "${provider.name}" does not implement analyze().`,
      {
        details: {
          stage: "provider",
          providerName: provider.name,
        },
      },
    );
  }
}

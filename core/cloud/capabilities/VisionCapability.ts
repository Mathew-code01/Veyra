// ============================================================================
// FILE: core/cloud/capabilities/VisionCapability.ts
// ============================================================================

export type VisionInputType = "image_url" | "data_url" | "base64" | "file";

export interface VisionCapability {
  readonly supported: boolean;

  readonly inputTypes: readonly VisionInputType[];

  readonly supportsMultipleImages: boolean;

  readonly supportsPdf: boolean;

  readonly supportsVideo: boolean;

  readonly maxImages?: number;
}

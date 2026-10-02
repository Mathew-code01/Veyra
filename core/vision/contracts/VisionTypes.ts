// ============================================================================
// FILE: core/vision/contracts/VisionTypes.ts
//
// PURPOSE:
// Compatibility boundary for the Vision core.
//
// CANONICAL DEFINITIONS:
//     shared/types/vision.ts
//
// IMPORTANT:
// Vision implementation code may continue importing VisionTypes from this
// location, but the actual contracts belong to shared.
//
// This prevents duplicate Vision models from developing inside core/vision.
// ============================================================================

export type {
  VisionSourceType,
  VisionSource,
  VisionImage,
  VisionDetailLevel,
  VisionContentType,
  VisionClassification,
  VisionObservationType,
  VisionBoundingBox,
  VisionObservation,
  VisionObject,
  VisionTextBlock,
  VisionOCRResult,
  VisionProviderUsage,
  VisionProviderMetadata,
  VisionTiming,
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from "../../../shared/types/vision";

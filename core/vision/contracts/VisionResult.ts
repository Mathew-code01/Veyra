// ============================================================================
// FILE: core/vision/contracts/VisionResult.ts
//
// PURPOSE:
// Core compatibility export for the canonical shared Vision result.
//
// CANONICAL CONTRACT:
//     shared/types/vision.ts
//
// VisionAnalyzer and VisionPipeline can continue importing VisionResult from
// the core/vision/contracts location without creating a duplicate model.
// ============================================================================

export type {
  VisionAnalysisResult as VisionResult,
  VisionAnalysisSummary,
  VisionTiming,
} from "../../../shared/types/vision";

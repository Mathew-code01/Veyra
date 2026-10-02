// ============================================================================
// FILE: core/vision/contracts/VisionRequest.ts
//
// PURPOSE:
// Core compatibility export for the canonical shared Vision request.
//
// CANONICAL CONTRACT:
//     shared/types/vision.ts
//
// Vision implementation code can retain its existing import path while the
// actual request model remains owned by shared.
// ============================================================================

export type { VisionAnalysisRequest as VisionRequest } from "../../../shared/types/vision";

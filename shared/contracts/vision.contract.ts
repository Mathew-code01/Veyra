// ============================================================================
// FILE: shared/contracts/vision.contract.ts
//
// PURPOSE:
// Stable transport/application contracts for Vision.
//
// ARCHITECTURAL ROLE:
//
//     core/vision
//          │
//          ▼
//     VisionAnalysisRequest
//          │
//          ▼
//     VisionAnalysisResult
//          │
//          ▼
//     core/context
//
// IMPORTANT:
// This file contains boundary contracts only.
//
// It must not:
// - import from core/vision
// - execute Vision
// - know about providers
// - contain OCR implementation
// - contain image processing logic
// ============================================================================

import type {
  VisionAnalysisRequest,
  VisionAnalysisResult,
} from "../types/vision";

// ============================================================================
// REQUEST
// ============================================================================

/**
 * Canonical Vision analysis request.
 *
 * Alias kept intentionally so transport/application code can depend on a
 * contract vocabulary without redefining the underlying shared type.
 */
export type AnalyzeVisionRequest = VisionAnalysisRequest;

// ============================================================================
// RESPONSE
// ============================================================================

/**
 * Canonical successful Vision analysis response.
 */
export interface AnalyzeVisionResponse {
  readonly requestId: string;

  readonly result: VisionAnalysisResult;
}

// ============================================================================
// GENERIC RESULT
// ============================================================================

export interface VisionOperationSuccess<T> {
  readonly ok: true;

  readonly value: T;
}

export interface VisionOperationFailure {
  readonly ok: false;

  readonly error: {
    readonly code: string;

    readonly message: string;

    readonly retryable?: boolean;

    readonly details?: Readonly<Record<string, unknown>>;
  };
}

export type VisionOperationResult<T> =
  VisionOperationSuccess<T> | VisionOperationFailure;

// ============================================================================
// ANALYZE CONTRACT
// ============================================================================

export type AnalyzeVisionResult = VisionOperationResult<AnalyzeVisionResponse>;

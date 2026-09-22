// ============================================================================
// FILE: core/vision/contracts/VisionResult.ts
// ============================================================================

import type {
  VisionClassification,
  VisionObservation,
  VisionObject,
  VisionProviderMetadata,
  VisionSource,
  VisionTextBlock,
} from "./VisionTypes";

import type { OCRResult } from "../ocr/OCRTypes";

export interface VisionAnalysisSummary {
  readonly description: string;
  readonly confidence: number;
}

export interface VisionTiming {
  readonly totalMs: number;
  readonly preprocessingMs?: number;
  readonly ocrMs?: number;
  readonly classificationMs?: number;
  readonly providerMs?: number;
}

export interface VisionResult {
  readonly analysisId: string;

  readonly summary: VisionAnalysisSummary;

  readonly classification: VisionClassification;

  readonly ocr?: OCRResult;

  readonly observations: readonly VisionObservation[];

  readonly objects: readonly VisionObject[];

  readonly textBlocks: readonly VisionTextBlock[];

  readonly provider?: VisionProviderMetadata;

  readonly timing: VisionTiming;

  readonly source?: VisionSource;

  readonly metadata: Readonly<Record<string, unknown>>;
}

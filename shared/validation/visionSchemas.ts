// ============================================================================
// FILE: shared/validation/visionSchemas.ts
//
// PURPOSE:
// Runtime validation for shared Vision contracts.
//
// ARCHITECTURAL RULE:
//
//     shared/validation
//            │
//            ├── validates shared Vision requests
//            └── validates shared Vision results
//
// This file must remain independent from core/vision.
// ============================================================================

import type {
  VisionAnalysisRequest,
  VisionAnalysisResult,
  VisionBoundingBox,
  VisionClassification,
  VisionContentType,
  VisionImage,
  VisionObservation,
  VisionObject,
  VisionProviderMetadata,
  VisionSource,
  VisionTextBlock,
} from "../types/vision";

// ============================================================================
// CONSTANTS
// ============================================================================

const VISION_CONTENT_TYPES: readonly VisionContentType[] = [
  "code",
  "document",
  "diagram",
  "chart",
  "table",
  "screenshot",
  "webpage",
  "terminal",
  "whiteboard",
  "presentation",
  "form",
  "resume",
  "job_description",
  "question",
  "text",
  "object",
  "scene",
  "mixed",
  "unknown",
];

const VISION_SOURCE_TYPES = [
  "image",
  "screenshot",
  "clipboard",
  "file",
  "camera",
  "screen",
  "unknown",
] as const;

const VISION_DETAIL_LEVELS = ["low", "medium", "high"] as const;

const OBSERVATION_TYPES = [
  "text",
  "object",
  "ui_element",
  "diagram",
  "chart",
  "table",
  "code",
  "document",
  "person",
  "scene",
  "other",
] as const;

// ============================================================================
// GENERIC HELPERS
// ============================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isConfidence(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// ============================================================================
// SOURCE
// ============================================================================

export function isVisionSource(value: unknown): value is VisionSource {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.type !== "string" ||
    !(VISION_SOURCE_TYPES as readonly string[]).includes(value.type)
  ) {
    return false;
  }

  if (value.id !== undefined && !isNonEmptyString(value.id)) {
    return false;
  }

  if (
    value.createdAt !== undefined &&
    !isPositiveSafeInteger(value.createdAt)
  ) {
    return false;
  }

  return value.metadata === undefined || isRecord(value.metadata);
}

// ============================================================================
// IMAGE
// ============================================================================

export function isVisionImage(value: unknown): value is VisionImage {
  if (!isRecord(value)) {
    return false;
  }

  if (!(value.data instanceof Uint8Array)) {
    return false;
  }

  if (value.data.byteLength <= 0) {
    return false;
  }

  if (!isNonEmptyString(value.mimeType)) {
    return false;
  }

  if (value.width !== undefined && !isPositiveSafeInteger(value.width)) {
    return false;
  }

  if (value.height !== undefined && !isPositiveSafeInteger(value.height)) {
    return false;
  }

  return true;
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

export function isVisionContentType(
  value: unknown,
): value is VisionContentType {
  return (
    typeof value === "string" &&
    (VISION_CONTENT_TYPES as readonly string[]).includes(value)
  );
}

export function isVisionClassification(
  value: unknown,
): value is VisionClassification {
  if (!isRecord(value)) {
    return false;
  }

  if (!isVisionContentType(value.type)) {
    return false;
  }

  if (!isConfidence(value.confidence)) {
    return false;
  }

  if (
    !Array.isArray(value.signals) ||
    !value.signals.every((signal) => typeof signal === "string")
  ) {
    return false;
  }

  if (value.scores !== undefined && !isRecord(value.scores)) {
    return false;
  }

  return true;
}

// ============================================================================
// BOUNDING BOX
// ============================================================================

export function isVisionBoundingBox(
  value: unknown,
): value is VisionBoundingBox {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeNumber(value.x) &&
    isNonNegativeNumber(value.y) &&
    isNonNegativeNumber(value.width) &&
    isNonNegativeNumber(value.height)
  );
}

// ============================================================================
// OBSERVATIONS
// ============================================================================

export function isVisionObservation(
  value: unknown,
): value is VisionObservation {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.description)) {
    return false;
  }

  if (
    typeof value.type !== "string" ||
    !(OBSERVATION_TYPES as readonly string[]).includes(value.type)
  ) {
    return false;
  }

  if (value.confidence !== undefined && !isConfidence(value.confidence)) {
    return false;
  }

  if (
    value.boundingBox !== undefined &&
    !isVisionBoundingBox(value.boundingBox)
  ) {
    return false;
  }

  if (value.text !== undefined && typeof value.text !== "string") {
    return false;
  }

  return value.metadata === undefined || isRecord(value.metadata);
}

// ============================================================================
// OBJECTS
// ============================================================================

export function isVisionObject(value: unknown): value is VisionObject {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.label)) {
    return false;
  }

  if (value.confidence !== undefined && !isConfidence(value.confidence)) {
    return false;
  }

  if (
    value.boundingBox !== undefined &&
    !isVisionBoundingBox(value.boundingBox)
  ) {
    return false;
  }

  return value.metadata === undefined || isRecord(value.metadata);
}

// ============================================================================
// TEXT BLOCKS
// ============================================================================

export function isVisionTextBlock(value: unknown): value is VisionTextBlock {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.text !== "string") {
    return false;
  }

  if (value.confidence !== undefined && !isConfidence(value.confidence)) {
    return false;
  }

  if (
    value.boundingBox !== undefined &&
    !isVisionBoundingBox(value.boundingBox)
  ) {
    return false;
  }

  if (value.language !== undefined && typeof value.language !== "string") {
    return false;
  }

  return value.metadata === undefined || isRecord(value.metadata);
}

// ============================================================================
// PROVIDER
// ============================================================================

export function isVisionProviderMetadata(
  value: unknown,
): value is VisionProviderMetadata {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.providerName)) {
    return false;
  }

  if (value.modelName !== undefined && typeof value.modelName !== "string") {
    return false;
  }

  if (value.requestId !== undefined && typeof value.requestId !== "string") {
    return false;
  }

  if (
    value.executionTarget !== undefined &&
    value.executionTarget !== "local" &&
    value.executionTarget !== "cloud"
  ) {
    return false;
  }

  if (value.usage !== undefined && !isRecord(value.usage)) {
    return false;
  }

  return value.metadata === undefined || isRecord(value.metadata);
}

// ============================================================================
// REQUEST
// ============================================================================

export function isVisionAnalysisRequest(
  value: unknown,
): value is VisionAnalysisRequest {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.id)) {
    return false;
  }

  if (!isVisionImage(value.image)) {
    return false;
  }

  if (value.source !== undefined && !isVisionSource(value.source)) {
    return false;
  }

  if (value.question !== undefined && typeof value.question !== "string") {
    return false;
  }

  if (value.useOCR !== undefined && typeof value.useOCR !== "boolean") {
    return false;
  }

  if (value.language !== undefined && typeof value.language !== "string") {
    return false;
  }

  if (
    value.detail !== undefined &&
    (typeof value.detail !== "string" ||
      !(VISION_DETAIL_LEVELS as readonly string[]).includes(value.detail))
  ) {
    return false;
  }

  if (
    value.maxImageBytes !== undefined &&
    !isPositiveSafeInteger(value.maxImageBytes)
  ) {
    return false;
  }

  if (value.maxWidth !== undefined && !isPositiveSafeInteger(value.maxWidth)) {
    return false;
  }

  if (
    value.maxHeight !== undefined &&
    !isPositiveSafeInteger(value.maxHeight)
  ) {
    return false;
  }

  if (
    value.providerName !== undefined &&
    typeof value.providerName !== "string"
  ) {
    return false;
  }

  if (value.modelName !== undefined && typeof value.modelName !== "string") {
    return false;
  }

  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    return false;
  }

  return true;
}

// ============================================================================
// RESULT
// ============================================================================

export function isVisionAnalysisResult(
  value: unknown,
): value is VisionAnalysisResult {
  if (!isRecord(value)) {
    return false;
  }

  if (!isNonEmptyString(value.analysisId)) {
    return false;
  }

  if (!isNonEmptyString(value.requestId)) {
    return false;
  }

  if (!isRecord(value.summary)) {
    return false;
  }

  if (!isNonEmptyString(value.summary.description)) {
    return false;
  }

  if (!isConfidence(value.summary.confidence)) {
    return false;
  }

  if (!isVisionClassification(value.classification)) {
    return false;
  }

  if (value.ocr !== undefined) {
    if (!isRecord(value.ocr)) {
      return false;
    }

    if (typeof value.ocr.text !== "string") {
      return false;
    }

    if (!isConfidence(value.ocr.confidence)) {
      return false;
    }

    if (
      value.ocr.language !== undefined &&
      typeof value.ocr.language !== "string"
    ) {
      return false;
    }
  }

  if (
    !Array.isArray(value.observations) ||
    !value.observations.every(isVisionObservation)
  ) {
    return false;
  }

  if (!Array.isArray(value.objects) || !value.objects.every(isVisionObject)) {
    return false;
  }

  if (
    !Array.isArray(value.textBlocks) ||
    !value.textBlocks.every(isVisionTextBlock)
  ) {
    return false;
  }

  if (
    value.provider !== undefined &&
    !isVisionProviderMetadata(value.provider)
  ) {
    return false;
  }

  if (!isRecord(value.timing)) {
    return false;
  }

  if (!isNonNegativeNumber(value.timing.totalMs)) {
    return false;
  }

  const timingFields = [
    "preprocessingMs",
    "ocrMs",
    "classificationMs",
    "providerMs",
  ] as const;

  for (const field of timingFields) {
    const timingValue = value.timing[field];

    if (timingValue !== undefined && !isNonNegativeNumber(timingValue)) {
      return false;
    }
  }

  if (value.source !== undefined && !isVisionSource(value.source)) {
    return false;
  }

  if (!isRecord(value.metadata)) {
    return false;
  }

  return true;
}

// ============================================================================
// ASSERTIONS
// ============================================================================

export function assertVisionAnalysisRequest(
  value: unknown,
): asserts value is VisionAnalysisRequest {
  if (!isVisionAnalysisRequest(value)) {
    throw new Error("Invalid shared VisionAnalysisRequest.");
  }
}

export function assertVisionAnalysisResult(
  value: unknown,
): asserts value is VisionAnalysisResult {
  if (!isVisionAnalysisResult(value)) {
    throw new Error("Invalid shared VisionAnalysisResult.");
  }
}

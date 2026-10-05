
// ============================================================================
// FILE: shared/validation/interviewSchemas.ts
//
// PURPOSE:
// Runtime validation helpers for shared Interview DTOs.
//
// No dependency on core/interview.
// ============================================================================

import {
  INTERVIEW_TYPES,
  isInterviewType,
  type InterviewType,
} from "../constants/interviewTypes";

export function isValidInterviewType(
  value: unknown,
): value is InterviewType {
  return isInterviewType(value);
}

export function assertInterviewType(
  value: unknown,
  fieldName = "interview type",
): asserts value is InterviewType {
  if (!isInterviewType(value)) {
    throw new TypeError(
      `${fieldName} must be one of: ${INTERVIEW_TYPES.join(", ")}.`,
    );
  }
}

export function validateInterviewConfidence(
  value: unknown,
  fieldName = "confidence",
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new TypeError(`${fieldName} must be a number between 0 and 1.`);
  }

  return value;
}

// ============================================================================
// FILE: core/errors/ErrorCode.ts
// PURPOSE:
// Core compatibility layer for the canonical shared error vocabulary.
//
// ARCHITECTURE:
//
//   shared/constants/errorCodes.ts
//              │
//              ├── ERROR_CODES
//              ├── ErrorCode
//              ├── ErrorSeverity
//              └── ErrorDetails
//                       │
//                       ▼
//              core/errors/ErrorCode.ts
//
// IMPORTANT:
//
// There must be ONE canonical error-code vocabulary across Veyra.
//
// This file intentionally does NOT define another ErrorCode union.
//
// The canonical source is:
//
//   shared/constants/errorCodes.ts
//
// Core execution behaviour such as retry policy may remain here.
// ============================================================================

export {
  ERROR_CODES,
  type ErrorCode,
  type ErrorSeverity,
  type ErrorDetails,
} from "../../shared/constants/errorCodes";

import { ERROR_CODES, type ErrorCode } from "../../shared/constants/errorCodes";

// ============================================================================
// RETRY POLICY
// ============================================================================

/**
 * Returns the default retryability for a canonical Veyra error code.
 *
 * Explicit retryability supplied by the caller still takes precedence.
 *
 * Retryable conditions are limited to transient failures:
 *
 * - rate limiting
 * - quota exhaustion
 * - timeout
 * - network failure
 * - temporary service/provider unavailability
 */
export function defaultErrorRetryable(code: ErrorCode): boolean {
  switch (code) {
    // ------------------------------------------------------------------------
    // TRANSIENT / RETRYABLE
    // ------------------------------------------------------------------------

    case ERROR_CODES.RATE_LIMITED:
    case ERROR_CODES.QUOTA_EXCEEDED:
    case ERROR_CODES.TIMEOUT:
    case ERROR_CODES.NETWORK_ERROR:
    case ERROR_CODES.SERVICE_UNAVAILABLE:
    case ERROR_CODES.AI_PROVIDER_UNAVAILABLE:
    case ERROR_CODES.AI_PROVIDER_TIMEOUT:
    case ERROR_CODES.AI_PROVIDER_RATE_LIMITED:
      return true;

    // ------------------------------------------------------------------------
    // NON-RETRYABLE
    // ------------------------------------------------------------------------

    case ERROR_CODES.CANCELLED:
    case ERROR_CODES.ABORTED:
    case ERROR_CODES.INVALID_REQUEST:
    case ERROR_CODES.INVALID_RESPONSE:
    case ERROR_CODES.INVALID_STATE:
    case ERROR_CODES.UNAUTHORIZED:
    case ERROR_CODES.FORBIDDEN:
    case ERROR_CODES.NOT_FOUND:
    case ERROR_CODES.PROVIDER:
    case ERROR_CODES.UNAVAILABLE:
    case ERROR_CODES.UNSUPPORTED:
    case ERROR_CODES.CONFIGURATION:
    case ERROR_CODES.MODEL_NOT_FOUND:
    case ERROR_CODES.MODEL_NOT_INSTALLED:
    case ERROR_CODES.MODEL_UNSUPPORTED:
    case ERROR_CODES.MODEL_NOT_LOADED:
    case ERROR_CODES.UNKNOWN:
    case ERROR_CODES.VALIDATION_FAILED:
    case ERROR_CODES.INTERNAL_ERROR:
    case ERROR_CODES.AI_PROVIDER_ERROR:
    case ERROR_CODES.AI_MODEL_NOT_FOUND:
    case ERROR_CODES.AI_CONTEXT_TOO_LARGE:
    case ERROR_CODES.AI_REQUEST_CANCELLED:
    case ERROR_CODES.AUDIO_PERMISSION_DENIED:
    case ERROR_CODES.AUDIO_DEVICE_NOT_FOUND:
    case ERROR_CODES.AUDIO_DEVICE_UNAVAILABLE:
    case ERROR_CODES.AUDIO_CAPTURE_FAILED:
    case ERROR_CODES.CAPTURE_PERMISSION_DENIED:
    case ERROR_CODES.CAPTURE_SOURCE_NOT_FOUND:
    case ERROR_CODES.CAPTURE_FAILED:
    case ERROR_CODES.DOCUMENT_NOT_FOUND:
    case ERROR_CODES.DOCUMENT_UNSUPPORTED:
    case ERROR_CODES.DOCUMENT_TOO_LARGE:
    case ERROR_CODES.DOCUMENT_READ_FAILED:
    case ERROR_CODES.DOCUMENT_PARSE_FAILED:
    case ERROR_CODES.PROFILE_NOT_FOUND:
    case ERROR_CODES.SESSION_NOT_FOUND:
    case ERROR_CODES.SESSION_ALREADY_ACTIVE:
    case ERROR_CODES.SESSION_NOT_ACTIVE:
    case ERROR_CODES.SESSION_INVALID_TRANSITION:
    case ERROR_CODES.STORAGE_ERROR:
    case ERROR_CODES.DATABASE_ERROR:
    default:
      return false;
  }
}

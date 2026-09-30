// ============================================================================
// FILE: shared/constants/errorCodes.ts
// PURPOSE:
// Canonical Veyra error-code vocabulary.
//
// IMPORTANT:
// Both shared consumers and core execution code must use this vocabulary.
// ============================================================================

export const ERROR_CODES = Object.freeze({
  // --------------------------------------------------------------------------
  // GENERIC
  // --------------------------------------------------------------------------

  UNKNOWN: "UNKNOWN_ERROR",

  VALIDATION_FAILED: "VALIDATION_FAILED",

  INVALID_REQUEST: "INVALID_REQUEST",

  INVALID_RESPONSE: "INVALID_RESPONSE",

  INVALID_STATE: "INVALID_STATE",

  UNAUTHORIZED: "UNAUTHORIZED",

  FORBIDDEN: "FORBIDDEN",

  NOT_FOUND: "NOT_FOUND",

  CONFLICT: "CONFLICT",

  PROVIDER: "PROVIDER",

  UNAVAILABLE: "UNAVAILABLE",

  UNSUPPORTED: "UNSUPPORTED",

  CONFIGURATION: "CONFIGURATION",

  INTERNAL_ERROR: "INTERNAL_ERROR",

  // --------------------------------------------------------------------------
  // RETRY / TRANSPORT
  // --------------------------------------------------------------------------

  RATE_LIMITED: "RATE_LIMITED",

  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",

  TIMEOUT: "TIMEOUT",

  CANCELLED: "CANCELLED",

  ABORTED: "ABORTED",

  NETWORK_ERROR: "NETWORK_ERROR",

  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",

  // --------------------------------------------------------------------------
  // AI PROVIDER
  // --------------------------------------------------------------------------

  AI_PROVIDER_UNAVAILABLE: "AI_PROVIDER_UNAVAILABLE",

  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",

  AI_PROVIDER_TIMEOUT: "AI_PROVIDER_TIMEOUT",

  AI_PROVIDER_RATE_LIMITED: "AI_PROVIDER_RATE_LIMITED",

  AI_MODEL_NOT_FOUND: "AI_MODEL_NOT_FOUND",

  AI_CONTEXT_TOO_LARGE: "AI_CONTEXT_TOO_LARGE",

  AI_REQUEST_CANCELLED: "AI_REQUEST_CANCELLED",

  // --------------------------------------------------------------------------
  // LOCAL MODEL
  // --------------------------------------------------------------------------

  MODEL_NOT_FOUND: "MODEL_NOT_FOUND",

  MODEL_NOT_INSTALLED: "MODEL_NOT_INSTALLED",

  MODEL_UNSUPPORTED: "MODEL_UNSUPPORTED",

  MODEL_NOT_LOADED: "MODEL_NOT_LOADED",

  // --------------------------------------------------------------------------
  // AUDIO
  // --------------------------------------------------------------------------

  AUDIO_PERMISSION_DENIED: "AUDIO_PERMISSION_DENIED",

  AUDIO_DEVICE_NOT_FOUND: "AUDIO_DEVICE_NOT_FOUND",

  AUDIO_DEVICE_UNAVAILABLE: "AUDIO_DEVICE_UNAVAILABLE",

  AUDIO_CAPTURE_FAILED: "AUDIO_CAPTURE_FAILED",

  // --------------------------------------------------------------------------
  // CAPTURE
  // --------------------------------------------------------------------------

  CAPTURE_PERMISSION_DENIED: "CAPTURE_PERMISSION_DENIED",

  CAPTURE_SOURCE_NOT_FOUND: "CAPTURE_SOURCE_NOT_FOUND",

  CAPTURE_FAILED: "CAPTURE_FAILED",

  // --------------------------------------------------------------------------
  // DOCUMENTS
  // --------------------------------------------------------------------------

  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",

  DOCUMENT_UNSUPPORTED: "DOCUMENT_UNSUPPORTED",

  DOCUMENT_TOO_LARGE: "DOCUMENT_TOO_LARGE",

  DOCUMENT_READ_FAILED: "DOCUMENT_READ_FAILED",

  DOCUMENT_PARSE_FAILED: "DOCUMENT_PARSE_FAILED",

  // --------------------------------------------------------------------------
  // PROFILE / SESSION
  // --------------------------------------------------------------------------

  PROFILE_NOT_FOUND: "PROFILE_NOT_FOUND",

  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",

  SESSION_ALREADY_ACTIVE: "SESSION_ALREADY_ACTIVE",

  SESSION_NOT_ACTIVE: "SESSION_NOT_ACTIVE",

  SESSION_INVALID_TRANSITION: "SESSION_INVALID_TRANSITION",

  // --------------------------------------------------------------------------
  // STORAGE
  // --------------------------------------------------------------------------

  STORAGE_ERROR: "STORAGE_ERROR",

  DATABASE_ERROR: "DATABASE_ERROR",
} as const);

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorSeverity = "info" | "warning" | "error" | "critical";

export interface ErrorDetails {
  readonly code: ErrorCode;

  readonly message: string;

  readonly requestId?: string;

  readonly details?: Readonly<Record<string, unknown>>;

  readonly retryable?: boolean;

  readonly severity?: ErrorSeverity;
}

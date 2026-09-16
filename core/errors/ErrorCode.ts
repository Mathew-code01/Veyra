// ============================================================================
// FILE: core/errors/ErrorCode.ts
// PURPOSE:
// Canonical error-code vocabulary shared by every Veyra execution layer.
//
// ARCHITECTURE:
// - core/ai uses these codes for local and generic AI failures.
// - core/cloud uses these codes for cloud transport/provider failures.
// - adapters such as CloudAIProvider preserve the same code when translating
//   errors between layers.
//
// IMPORTANT:
// There must be ONE canonical spelling for semantically identical errors.
//
// Examples:
//   RATE_LIMITED  -> RATE_LIMIT
//   BAD_REQUEST   -> INVALID_REQUEST
//   SERVER        -> UNAVAILABLE
//
// This file intentionally contains no dependency on AI, cloud, Electron,
// HTTP clients, providers, or runtimes.
// ============================================================================

export type ErrorCode =
  // --------------------------------------------------------------------------
  // REQUEST / ACCESS
  // --------------------------------------------------------------------------

  /**
   * The request is malformed, invalid, or cannot be accepted.
   *
   * Cloud:
   *   HTTP 400 / 422
   *
   * Local:
   *   Invalid AI/runtime request parameters.
   */
  | "INVALID_REQUEST"

  /**
   * Credentials are missing, invalid, expired, or rejected.
   */
  | "AUTHENTICATION"

  /**
   * Credentials are valid but do not have permission for the operation.
   */
  | "AUTHORIZATION"

  // --------------------------------------------------------------------------
  // RATE / QUOTA
  // --------------------------------------------------------------------------

  /**
   * The caller is temporarily sending requests too quickly.
   *
   * This is the canonical replacement for:
   *   RATE_LIMITED
   */
  | "RATE_LIMIT"

  /**
   * The provider/account/model quota has been exhausted.
   *
   * This remains distinct from RATE_LIMIT because quota exhaustion and
   * request-rate throttling are not the same condition.
   */
  | "QUOTA_EXCEEDED"

  // --------------------------------------------------------------------------
  // TRANSPORT / AVAILABILITY
  // --------------------------------------------------------------------------

  /**
   * The operation exceeded its allowed time.
   */
  | "TIMEOUT"

  /**
   * The request could not reach or communicate with its target.
   */
  | "NETWORK"

  /**
   * The selected provider or execution backend failed at the provider layer.
   */
  | "PROVIDER"

  /**
   * The target/resource could not be found.
   *
   * This is intentionally separate from MODEL_NOT_FOUND because a cloud
   * provider, endpoint, or other resource can also be missing.
   */
  | "NOT_FOUND"

  /**
   * The target is temporarily unavailable or a backend service failed.
   *
   * This is the canonical replacement for:
   *   SERVER
   */
  | "UNAVAILABLE"

  /**
   * The requested operation conflicts with the current resource state.
   */
  | "CONFLICT"

  /**
   * The requested operation/capability is not supported.
   *
   * This is different from MODEL_UNSUPPORTED, which specifically describes
   * a model/runtime compatibility problem.
   */
  | "UNSUPPORTED"

  // --------------------------------------------------------------------------
  // MODEL / RUNTIME
  // --------------------------------------------------------------------------

  /**
   * The requested model does not exist or could not be located.
   */
  | "MODEL_NOT_FOUND"

  /**
   * The model exists but is not installed locally.
   */
  | "MODEL_NOT_INSTALLED"

  /**
   * The model is known but unsupported by the available runtime.
   */
  | "MODEL_UNSUPPORTED"

  /**
   * The model is installed/known but is not currently loaded.
   */
  | "MODEL_NOT_LOADED"

  // --------------------------------------------------------------------------
  // CONTENT / RESPONSE
  // --------------------------------------------------------------------------

  /**
   * The provider/runtime refused the content because of a content policy.
   */
  | "CONTENT_BLOCKED"

  /**
   * The provider returned a response that Veyra could not safely interpret.
   */
  | "INVALID_RESPONSE"

  // --------------------------------------------------------------------------
  // LIFECYCLE / CONFIGURATION
  // --------------------------------------------------------------------------

  /**
   * The operation was explicitly cancelled or aborted.
   */
  | "ABORTED"

  /**
   * Required runtime/provider configuration is invalid or missing.
   */
  | "CONFIGURATION"

  /**
   * The error could not be classified more specifically.
   */
  | "UNKNOWN";

/**
 * Returns the default retryability for a canonical Veyra error code.
 *
 * Explicit retryable values supplied by callers still override this default.
 */
export function defaultErrorRetryable(code: ErrorCode): boolean {
  switch (code) {
    case "RATE_LIMIT":
    case "QUOTA_EXCEEDED":
    case "TIMEOUT":
    case "NETWORK":
    case "UNAVAILABLE":
      return true;

    case "INVALID_REQUEST":
    case "AUTHENTICATION":
    case "AUTHORIZATION":
    case "PROVIDER":
    case "NOT_FOUND":
    case "CONFLICT":
    case "UNSUPPORTED":
    case "MODEL_NOT_FOUND":
    case "MODEL_NOT_INSTALLED":
    case "MODEL_UNSUPPORTED":
    case "MODEL_NOT_LOADED":
    case "CONTENT_BLOCKED":
    case "INVALID_RESPONSE":
    case "ABORTED":
    case "CONFIGURATION":
    case "UNKNOWN":
    default:
      return false;
  }
}

// ============================================================================
// FILE: core/cloud/contracts/CloudRateLimit.ts
// ============================================================================

export interface CloudRateLimit {
  /**
   * Requests remaining in the current window.
   */
  readonly requestsRemaining?: number;

  /**
   * Token budget remaining.
   */
  readonly tokensRemaining?: number;

  /**
   * Unix timestamp in milliseconds when the limit resets.
   */
  readonly resetAt?: number;

  /**
   * Provider supplied request limit.
   */
  readonly requestLimit?: number;

  /**
   * Provider supplied token limit.
   */
  readonly tokenLimit?: number;

  /**
   * Raw provider metadata.
   */
  readonly details?: Readonly<Record<string, unknown>>;
}

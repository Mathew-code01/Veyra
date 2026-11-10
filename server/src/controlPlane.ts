import type { Request, Response, NextFunction } from "express";

export interface VerifiedPrincipal {
  readonly accountId: string;
  readonly subject: string;
  readonly email?: string;
}

export interface AccessTokenVerifier {
  /** Must verify signature, issuer, audience, expiry, and intended token use. */
  verifyAccessToken(token: string): Promise<VerifiedPrincipal | undefined>;
}

export interface Plan {
  readonly id: string;
  readonly name: string;
  readonly capabilities: Readonly<Record<string, boolean | number | string>>;
}

export interface AccountService {
  /** Implementations must derive state from server-owned account/billing records. */
  getAccount(accountId: string): Promise<unknown>;
  getEntitlements(accountId: string): Promise<unknown>;
  getSubscription(accountId: string): Promise<unknown>;
  getUsage(accountId: string): Promise<unknown>;
  requestDeletion(accountId: string): Promise<void>;
  listPlans(): Promise<readonly Plan[]>;
}

export interface DeviceService {
  register(accountId: string, input: { readonly deviceName: string }): Promise<unknown>;
  revoke(accountId: string, deviceId: string): Promise<boolean>;
}

export interface BillingEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
}

export interface BillingService {
  createCheckoutSession(
    accountId: string,
    planId: string,
    idempotencyKey: string,
  ): Promise<{ readonly url: string }>;
  createPortalSession(accountId: string): Promise<{ readonly url: string }>;
  verifyWebhook(rawBody: Buffer, signature: string): Promise<BillingEvent | undefined>;
  /** Must be durable, transactional, and idempotent by event ID. */
  applyWebhook(event: BillingEvent): Promise<void>;
}

export interface CloudAIService {
  listModels(accountId: string): Promise<unknown>;
  /**
   * Must authorize account state, entitlements, model/cost, server-held consent,
   * rate limits, durable quota, and idempotency before invoking a provider.
   */
  execute(
    accountId: string,
    request: {
      readonly modelId: string;
      readonly messages: readonly { readonly role: string; readonly content: string }[];
      readonly externalProcessingConsent: boolean;
      readonly idempotencyKey: string;
    },
  ): Promise<unknown>;
  getUsage(accountId: string): Promise<unknown>;
}

export interface ServerDependencies {
  readonly tokenVerifier: AccessTokenVerifier;
  readonly accounts: AccountService;
  readonly devices: DeviceService;
  readonly billing: BillingService;
  readonly cloudAI?: CloudAIService;
  readonly allowedOrigins?: readonly string[];
}

export interface AuthenticatedRequest extends Request {
  readonly principal?: VerifiedPrincipal;
}

export function getPrincipal(request: Request): VerifiedPrincipal {
  const principal = (request as AuthenticatedRequest).principal;
  if (!principal) {
    throw new Error("Authentication required.");
  }
  return principal;
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
): void {
  const status =
    error instanceof RequestValidationError ? 400 :
    error instanceof ResourceUnavailableError ? 503 :
    error instanceof AuthorizationError ? 403 : 500;
  const code =
    error instanceof RequestValidationError ? "invalid_request" :
    error instanceof ResourceUnavailableError ? "service_unavailable" :
    error instanceof AuthorizationError ? "forbidden" : "internal_error";
  response.status(status).json({
    error: {
      code,
      message: status === 500 ? "The request could not be completed." : error instanceof Error ? error.message : "The request could not be completed.",
    },
  });
}

export class RequestValidationError extends Error {}
export class ResourceUnavailableError extends Error {}
export class AuthorizationError extends Error {}

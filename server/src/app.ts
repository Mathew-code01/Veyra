import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import {
  AuthorizationError,
  errorHandler,
  getPrincipal,
  RequestValidationError,
  ResourceUnavailableError,
  type ServerDependencies,
  type VerifiedPrincipal,
} from "./controlPlane.js";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

const checkoutSchema = z.object({
  planId: z.string().trim().min(1).max(100),
  idempotencyKey: z.string().trim().min(16).max(128),
}).strict();

const deviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
}).strict();

const aiRequestSchema = z.object({
  modelId: z.string().trim().min(1).max(200),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string().max(32_000),
  }).strict()).min(1).max(100),
  externalProcessingConsent: z.literal(true),
  idempotencyKey: z.string().trim().min(16).max(128),
}).strict();

const interviewExecuteSchema = z.object({
  operation: z.enum(["understand_question", "plan_answer", "evaluate_answer", "domain_reasoning", "structured_guidance"]),
  sessionId: z.string().trim().min(1).max(200).optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  externalProcessingConsent: z.literal(true),
  idempotencyKey: z.string().trim().min(16).max(128),
}).strict().superRefine((value, ctx) => {
  const serialized = JSON.stringify(value.payload ?? {}).toLowerCase();
  if (/"(api[_-]?key|apikey|byok|secret|token|authorization|credential|bearer|password)"/.test(serialized)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Secrets/BYOK fields are not permitted." });
  }
});

type AsyncHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<unknown>;

function asyncHandler(handler: AsyncHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    void handler(request, response, next).catch(next);
  };
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new RequestValidationError("Request body is invalid.");
  }
  return result.data;
}

function captureRawBody(request: Request, _response: Response, body: Buffer): void {
  (request as RawBodyRequest).rawBody = Buffer.from(body);
}

export function createServerApp(dependencies: ServerDependencies) {
  if (!dependencies?.tokenVerifier || !dependencies.accounts || !dependencies.devices || !dependencies.billing) {
    throw new Error("Identity, account, device, and billing adapters are required.");
  }

  const app = express();
  const authenticate = asyncHandler(async (request, response, next) => {
    const header = request.header("authorization");
    const match = header?.match(/^Bearer ([^\s]+)$/u);
    if (!match) {
      response.status(401).json({ error: { code: "unauthenticated", message: "A valid access token is required." } });
      return;
    }

    const principal: VerifiedPrincipal | undefined =
      await dependencies.tokenVerifier.verifyAccessToken(match[1]);
    if (!principal?.accountId || !principal.subject) {
      response.status(401).json({ error: { code: "unauthenticated", message: "A valid access token is required." } });
      return;
    }

    (request as Request & { principal?: VerifiedPrincipal }).principal = principal;
    next();
  });
  const accountRoute = (operation: (accountId: string) => Promise<unknown>) =>
    asyncHandler(async (request, response) => {
      response.json(await operation(getPrincipal(request).accountId));
    });

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin: dependencies.allowedOrigins?.length ? [...dependencies.allowedOrigins] : false,
    credentials: true,
  }));
  app.use(rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        error: { code: "rate_limited", message: "Too many requests." },
      });
    },
  }));
  app.use(express.json({ limit: "256kb", verify: captureRawBody }));

  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.get("/api/v1/plans", asyncHandler(async (_request, response) => {
    response.json(await dependencies.accounts.listPlans());
  }));
  app.get("/api/v1/auth/session", authenticate, accountRoute(async (accountId) => ({
    account: await dependencies.accounts.getAccount(accountId),
    entitlements: await dependencies.accounts.getEntitlements(accountId),
  })));
  app.post("/api/v1/auth/refresh", (_request, response) => {
    response.status(503).json({
      error: { code: "identity_provider_unconfigured", message: "Token refresh is handled by the configured identity provider." },
    });
  });
  app.get("/api/v1/account", authenticate, accountRoute((id) => dependencies.accounts.getAccount(id)));
  app.delete("/api/v1/account", authenticate, asyncHandler(async (request, response) => {
    await dependencies.accounts.requestDeletion(getPrincipal(request).accountId);
    response.status(202).json({ accepted: true });
  }));
  app.get("/api/v1/entitlements", authenticate, accountRoute((id) => dependencies.accounts.getEntitlements(id)));
  app.get("/api/v1/subscription", authenticate, accountRoute((id) => dependencies.accounts.getSubscription(id)));
  app.get("/api/v1/usage", authenticate, accountRoute((id) => dependencies.accounts.getUsage(id)));
  app.post("/api/v1/devices/register", authenticate, asyncHandler(async (request, response) => {
    const input = parseBody(deviceSchema, request.body);
    response.status(201).json(await dependencies.devices.register(getPrincipal(request).accountId, input));
  }));
  app.delete("/api/v1/devices/:deviceId", authenticate, asyncHandler(async (request, response) => {
    const parameter = request.params.deviceId;
    if (typeof parameter !== "string" || !parameter.trim()) {
      throw new RequestValidationError("Device ID is invalid.");
    }
    const revoked = await dependencies.devices.revoke(getPrincipal(request).accountId, parameter.trim());
    if (!revoked) throw new AuthorizationError("Device was not found for this account.");
    response.status(204).end();
  }));
  app.post("/api/v1/billing/checkout-session", authenticate, asyncHandler(async (request, response) => {
    const input = parseBody(checkoutSchema, request.body);
    const session = await dependencies.billing.createCheckoutSession(
      getPrincipal(request).accountId,
      input.planId,
      input.idempotencyKey,
    );
    response.status(201).json(session);
  }));
  app.post("/api/v1/billing/portal-session", authenticate, asyncHandler(async (request, response) => {
    response.status(201).json(
      await dependencies.billing.createPortalSession(getPrincipal(request).accountId),
    );
  }));
  app.post("/api/v1/webhooks/billing", asyncHandler(async (request, response) => {
    const signature = request.header("billing-signature");
    const rawBody = (request as RawBodyRequest).rawBody;
    if (!signature || !rawBody) throw new RequestValidationError("Webhook signature and raw body are required.");
    const event = await dependencies.billing.verifyWebhook(rawBody, signature);
    if (!event) throw new AuthorizationError("Webhook signature is invalid.");
    await dependencies.billing.applyWebhook(event);
    response.status(202).json({ accepted: true });
  }));
  app.get("/api/v1/ai/models", authenticate, asyncHandler(async (request, response) => {
    if (!dependencies.cloudAI) throw new ResourceUnavailableError("Cloud AI is disabled.");
    response.json(await dependencies.cloudAI.listModels(getPrincipal(request).accountId));
  }));
  app.post("/api/v1/ai/execute", authenticate, asyncHandler(async (request, response) => {
    const input = parseBody(aiRequestSchema, request.body);
    if (!dependencies.cloudAI) throw new ResourceUnavailableError("Cloud AI is disabled.");
    response.json(await dependencies.cloudAI.execute(getPrincipal(request).accountId, input));
  }));
  app.post("/api/v1/interview/execute", authenticate, asyncHandler(async (request, response) => {
    const input = parseBody(interviewExecuteSchema, request.body);
    if (!dependencies.interviewGateway) {
      throw new ResourceUnavailableError("Interview cloud gateway is not configured.");
    }
    response.json(await dependencies.interviewGateway.executeInterview(getPrincipal(request).accountId, input));
  }));
  app.post("/api/v1/ai/stream", authenticate, (_request, response) => {
    response.status(503).json({ error: { code: "streaming_disabled", message: "Streaming execution is not configured." } });
  });
  app.get("/api/v1/ai/usage", authenticate, asyncHandler(async (request, response) => {
    if (!dependencies.cloudAI) throw new ResourceUnavailableError("Cloud AI is disabled.");
    response.json(await dependencies.cloudAI.getUsage(getPrincipal(request).accountId));
  }));

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "not_found", message: "The requested resource was not found." },
    });
  });
  app.use(((error: unknown, request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) return next(error);
    errorHandler(error, request, response, next);
  }) as ErrorRequestHandler);
  return app;
}
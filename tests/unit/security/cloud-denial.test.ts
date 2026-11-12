import { afterEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { createServerApp } from "../../../server/src/app";
import { normalizeCloudProviderError } from "../../../server/src/cloudGateway";

function makeServer(overrides: Record<string, unknown> = {}) {
  return createServerApp({
    tokenVerifier: {
      async verifyAccessToken(token: string) {
        return token === "ok" ? { accountId: "acct-1", subject: "s1" } : undefined;
      },
    },
    accounts: {
      async getAccount() { return {}; },
      async getEntitlements() { return {}; },
      async getSubscription() { return {}; },
      async getUsage() { return {}; },
      async requestDeletion() { return; },
      async listPlans() { return []; },
    },
    devices: {
      async register() { return {}; },
      async revoke() { return false; },
    },
    billing: {
      async createCheckoutSession() { return { url: "x" }; },
      async createPortalSession() { return { url: "x" }; },
      async verifyWebhook() { return undefined; },
      async applyWebhook() { return; },
    },
    ...overrides,
  } as any);
}

async function post(server: any, path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return res;
}

async function withServer<T>(overrides: Record<string, unknown>, fn: (server: any, base: string) => Promise<T>): Promise<T> {
  const server = makeServer(overrides).listen(0);
  await once(server, "listening");
  try {
    return await fn(server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

describe("security: BYOK and cloud execution isolation", () => {
  it("denies cloud provider errors with clear, non-silent classification", () => {
    expect(normalizeCloudProviderError(new Error("provider timeout"))).toEqual({
      code: "provider_timeout",
      message: "The cloud provider timed out.",
      retryable: true,
    });
    expect(normalizeCloudProviderError(new Error("rate limit exceeded"))).toEqual({
      code: "rate_limited",
      message: "Cloud provider quota or rate limit was reached.",
      retryable: true,
    });
    expect(normalizeCloudProviderError(new Error("unauthorized"))).toEqual({
      code: "unauthorized",
      message: "Cloud provider authorization failed.",
      retryable: false,
    });
    expect(normalizeCloudProviderError(new Error("service unavailable 503"))).toEqual({
      code: "provider_unavailable",
      message: "Cloud provider is unavailable.",
      retryable: true,
    });
    expect(normalizeCloudProviderError(new Error("boom"))).toEqual({
      code: "provider_error",
      message: "Cloud provider request failed.",
      retryable: false,
    });
  });

  it("denies unauthenticated, missing-consent, secret-field, and unconfigured requests", async () => {
    await withServer({}, async (_server, base) => {
      const noAuth = await post(_server, "/api/v1/interview/execute", {
        operation: "understand_question",
        payload: {},
        externalProcessingConsent: true,
        idempotencyKey: "0123456789abcdef",
      });
      expect(noAuth.status).toBe(401);

      const noConsent = await post(_server, "/api/v1/interview/execute", {
        operation: "understand_question",
        payload: {},
        idempotencyKey: "0123456789abcdef",
      }, "ok");
      expect(noConsent.status).toBe(400);

      const secret = await post(_server, "/api/v1/interview/execute", {
        operation: "understand_question",
        payload: { apiKey: "sk-secret" },
        externalProcessingConsent: true,
        idempotencyKey: "0123456789abcdef",
      }, "ok");
      expect(secret.status).toBe(400);

      const disabled = await post(_server, "/api/v1/interview/execute", {
        operation: "understand_question",
        payload: {},
        externalProcessingConsent: true,
        idempotencyKey: "0123456789abcdef",
      }, "ok");
      expect(disabled.status).toBe(503);
    });
  });

  it("routes authorized requests to the injected gateway and never forwards secrets", async () => {
    let received: any;
    await withServer(
      {
        interviewGateway: {
          async executeInterview(_accountId: string, req: any) {
            received = req;
            return {
              requestId: "r1",
              operation: req.operation,
              status: "completed",
              result: { ok: true },
              provider: "mock",
              model: "mock",
              audit: { decision: "authorized" },
            };
          },
        },
      },
      async (_server) => {
        const valid = await post(_server, "/api/v1/interview/execute", {
          operation: "plan_answer",
          sessionId: "s1",
          payload: { question: "Q" },
          externalProcessingConsent: true,
          idempotencyKey: "0123456789abcdef",
        }, "ok");
        expect(valid.status).toBe(200);
        expect(received).toBeDefined();
        expect(received.payload.question).toBe("Q");
        expect(received.payload.apiKey).toBeUndefined();

        const secret = await post(_server, "/api/v1/interview/execute", {
          operation: "understand_question",
          payload: { apiKey: "must-not-forward" },
          externalProcessingConsent: true,
          idempotencyKey: "0123456789abcdeg",
        }, "ok");
        expect(secret.status).toBe(400);
        expect(received?.payload?.apiKey).toBeUndefined();
      },
    );
  });

  it("surfaces provider timeout as a denial, not a silent fallback", async () => {
    await withServer(
      {
        interviewGateway: {
          async executeInterview() {
            throw new Error("provider timeout");
          },
        },
      },
      async (_server, base) => {
        const res = await post(_server, "/api/v1/interview/execute", {
          operation: "plan_answer",
          payload: {},
          externalProcessingConsent: true,
          idempotencyKey: "0123456789abcdef",
        }, "ok");
        expect(res.status).toBe(500);
      },
    );
  });
});

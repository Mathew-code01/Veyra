import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createServerApp } from "../src/app.js";

describe("server interview gateway contract", () => {
  it("rejects unauthenticated, missing-consent, BYOK-secret, and unconfigured requests", async () => {
    const server = createServerApp({
      tokenVerifier: {
        async verifyAccessToken(token: string) {
          return token === "ok" ? { accountId: "a1", subject: "s1" } : undefined;
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
    } as any).listen(0);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const noAuth = await fetch(`${base}/api/v1/interview/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "understand_question", payload: {}, externalProcessingConsent: true, idempotencyKey: "0123456789abcdef" }),
      });
      assert.equal(noAuth.status, 401);

      const noConsent = await fetch(`${base}/api/v1/interview/execute`, {
        method: "POST",
        headers: { authorization: "Bearer ok", "content-type": "application/json" },
        body: JSON.stringify({ operation: "understand_question", payload: {}, idempotencyKey: "0123456789abcdef" }),
      });
      assert.equal(noConsent.status, 400);

      const withSecret = await fetch(`${base}/api/v1/interview/execute`, {
        method: "POST",
        headers: { authorization: "Bearer ok", "content-type": "application/json" },
        body: JSON.stringify({ operation: "understand_question", payload: { apiKey: "secret" }, externalProcessingConsent: true, idempotencyKey: "0123456789abcdef" }),
      });
      assert.equal(withSecret.status, 400);

      const disabled = await fetch(`${base}/api/v1/interview/execute`, {
        method: "POST",
        headers: { authorization: "Bearer ok", "content-type": "application/json" },
        body: JSON.stringify({ operation: "understand_question", payload: {}, externalProcessingConsent: true, idempotencyKey: "0123456789abcdef" }),
      });
      assert.equal(disabled.status, 503);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });

  it("routes authorized request to injected gateway", async () => {
    let called: any;
    const server = createServerApp({
      tokenVerifier: {
        async verifyAccessToken() {
          return { accountId: "acct-1", subject: "s1" };
        },
      },
      accounts: {
        async getAccount() { return {}; },
        async getEntitlements() { return { cloudAI: true }; },
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
      interviewGateway: {
        async executeInterview(accountId: string, req: any) {
          called = { accountId, req };
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
    } as any).listen(0);
    await once(server, "listening");
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const ok = await fetch(`${base}/api/v1/interview/execute`, {
        method: "POST",
        headers: { authorization: "Bearer ok", "content-type": "application/json" },
        body: JSON.stringify({ operation: "plan_answer", sessionId: "s1", payload: { question: "Q" }, externalProcessingConsent: true, idempotencyKey: "0123456789abcdef" }),
      });
      assert.equal(ok.status, 200);
      assert.equal(called.accountId, "acct-1");
      const json = await ok.json();
      assert.equal(json.status, "completed");
      assert.equal(json.operation, "plan_answer");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    }
  });
});

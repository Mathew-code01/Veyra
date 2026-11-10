import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createServerApp } from "../src/app.js";

const calls: string[] = [];
const dependencies = {
  tokenVerifier: {
    async verifyAccessToken(token: string) {
      return token === "test-token"
        ? { accountId: "account-from-token", subject: "subject-1" }
        : undefined;
    },
  },
  accounts: {
    async getAccount(id: string) { calls.push(`account:${id}`); return { id }; },
    async getEntitlements(id: string) { calls.push(`entitlements:${id}`); return { cloudAI: false }; },
    async getSubscription(id: string) { return { accountId: id, status: "none" }; },
    async getUsage(id: string) { return { accountId: id, units: 0 }; },
    async requestDeletion(id: string) { calls.push(`delete:${id}`); },
    async listPlans() { return [{ id: "free", name: "Free", capabilities: { localAI: true } }]; },
  },
  devices: {
    async register(id: string) { return { accountId: id, deviceId: "device-1" }; },
    async revoke(id: string, deviceId: string) { return id === "account-from-token" && deviceId === "device-1"; },
  },
  billing: {
    async createCheckoutSession(id: string, planId: string, key: string) {
      calls.push(`checkout:${id}:${planId}:${key}`);
      return { url: "https://checkout.invalid/session" };
    },
    async createPortalSession(id: string) { return { url: `https://billing.invalid/${id}` }; },
    async verifyWebhook(body: Buffer, signature: string) {
      return signature === "valid-signature"
        ? { id: body.toString("utf8"), type: "test.event", payload: {} }
        : undefined;
    },
    async applyWebhook(event: { id: string }) { calls.push(`webhook:${event.id}`); },
  },
};

const server = createServerApp(dependencies).listen(0);
await once(server, "listening");
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => error ? reject(error) : resolve());
}));

describe("server control-plane boundaries", () => {
  it("serves plans without exposing account-scoped data", async () => {
    const response = await fetch(`${baseUrl}/api/v1/plans`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [
      { id: "free", name: "Free", capabilities: { localAI: true } },
    ]);
  });

  it("rejects missing and invalid access tokens", async () => {
    for (const headers of [{}, { authorization: "Bearer invalid" }]) {
      const response = await fetch(`${baseUrl}/api/v1/account`, { headers });
      assert.equal(response.status, 401);
    }
  });

  it("derives account identity from the verified token, not request data", async () => {
    const response = await fetch(`${baseUrl}/api/v1/account`, {
      headers: { authorization: "Bearer test-token" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "account-from-token" });
    assert.equal(calls.at(-1), "account:account-from-token");
  });

  it("validates checkout and makes provider idempotency explicit", async () => {
    const response = await fetch(`${baseUrl}/api/v1/billing/checkout-session`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        planId: "free",
        idempotencyKey: "checkout-request-0001",
      }),
    });
    assert.equal(response.status, 201);
    assert.match(calls.at(-1) ?? "", /^checkout:account-from-token:free:/u);
  });

  it("verifies billing webhook signatures before applying events", async () => {
    const invalid = await fetch(`${baseUrl}/api/v1/webhooks/billing`, {
      method: "POST",
      headers: { "content-type": "application/json", "billing-signature": "bad" },
      body: JSON.stringify({ id: "event-invalid" }),
    });
    assert.equal(invalid.status, 403);
    assert.equal(calls.some((call) => call === "webhook:event-invalid"), false);

    const valid = await fetch(`${baseUrl}/api/v1/webhooks/billing`, {
      method: "POST",
      headers: { "content-type": "application/json", "billing-signature": "valid-signature" },
      body: JSON.stringify({ id: "event-valid" }),
    });
    assert.equal(valid.status, 202);
    assert.equal(calls.includes('webhook:{"id":"event-valid"}'), true);
  });

  it("keeps cloud inference disabled when no authorized cloud gateway is configured", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelId: "unknown",
        messages: [{ role: "user", content: "test" }],
        externalProcessingConsent: true,
        idempotencyKey: "ai-request-00000001",
      }),
    });
    assert.equal(response.status, 503);
  });

  it("rejects BYOK secrets and missing consent in cloud request bodies", async () => {
    const response = await fetch(`${baseUrl}/api/v1/ai/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelId: "unknown",
        messages: [{ role: "user", content: "test" }],
        apiKey: "not-accepted",
        idempotencyKey: "ai-request-00000001",
      }),
    });
    assert.equal(response.status, 400);
    const missingConsent = await fetch(`${baseUrl}/api/v1/ai/execute`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        modelId: "unknown",
        messages: [{ role: "user", content: "test" }],
        idempotencyKey: "ai-request-00000001",
      }),
    });
    assert.equal(missingConsent.status, 400);
  });
});

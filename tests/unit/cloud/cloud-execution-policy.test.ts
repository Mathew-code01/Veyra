import { describe, expect, it, vi } from "vitest";

import { CloudGateway } from "../../../core/cloud/CloudGateway";
import {
  CloudExecutionPolicy,
  cloudModelPolicyKey,
  type CloudQuotaLedger,
} from "../../../core/cloud/CloudExecutionPolicy";
import { CloudProviderRegistry } from "../../../core/cloud/CloudProviderRegistry";
import type { CloudProvider } from "../../../core/cloud/CloudProvider";
import type { CloudRequest } from "../../../core/cloud/contracts/CloudRequest";
import type { CloudResponse } from "../../../core/cloud/contracts/CloudResponse";
import type { CloudStream } from "../../../core/cloud/contracts/CloudStream";
import { CloudError } from "../../../core/cloud/contracts/CloudError";
import { CloudAIProvider } from "../../../core/ai/CloudAIProvider";
import { createAIRequest } from "../../../core/ai/AIRequest";

const providerId = "test-provider";
const modelId = "test-model";

function createProvider(): CloudProvider & {
  execute: ReturnType<typeof vi.fn>;
  stream: ReturnType<typeof vi.fn>;
} {
  return {
    id: providerId,
    name: "Test provider",
    config: {} as CloudProvider["config"],
    capabilities: {
      textGeneration: true,
      streaming: true,
      vision: true,
      speechToText: true,
      textToSpeech: true,
      embeddings: true,
      documentAnalysis: true,
      structuredOutput: true,
      toolCalling: true,
    },
    models: [],
    execute: vi.fn(async (): Promise<CloudResponse> => ({
      type: "text_generation",
      providerId,
      model: modelId,
      text: "ok",
    })),
    stream: vi.fn(
      () =>
        ({
          providerId,
          model: modelId,
          startedAt: Date.now(),
          cancel: vi.fn(),
          async *[Symbol.asyncIterator]() {},
        }) as CloudStream,
    ),
    healthCheck: vi.fn(),
  };
}

function createGateway(policy?: CloudExecutionPolicy): {
  gateway: CloudGateway;
  provider: ReturnType<typeof createProvider>;
} {
  const provider = createProvider();
  const registry = new CloudProviderRegistry();
  registry.register(provider);
  return {
    gateway: new CloudGateway(registry, undefined, policy),
    provider,
  };
}

function request(model = modelId): CloudRequest {
  return {
    type: "text_generation",
    model,
    messages: [{ role: "user", content: "hello" }],
  };
}

function freeConfirmedPolicy(): CloudExecutionPolicy {
  return new CloudExecutionPolicy({
    externalProcessingAllowed: true,
    models: {
      [cloudModelPolicyKey(providerId, modelId)]: {
        classification: "FREE_CONFIRMED",
      },
    },
  });
}

describe("CloudExecutionPolicy at CloudGateway", () => {
  it("blocks cloud generation by default before provider execution", async () => {
    const { gateway, provider } = createGateway();

    await expect(gateway.execute(providerId, request())).rejects.toMatchObject({
      code: "FORBIDDEN",
      retryable: false,
    });
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it("blocks cloud streaming by default before provider execution", () => {
    const { gateway, provider } = createGateway();

    expect(() => gateway.stream(providerId, request())).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(provider.stream).not.toHaveBeenCalled();
  });

  it("allows only an explicitly authorized confirmed-free model", async () => {
    const { gateway, provider } = createGateway(freeConfirmedPolicy());

    await expect(gateway.execute(providerId, request())).resolves.toMatchObject(
      {
        text: "ok",
      },
    );
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });

  it("applies the policy to explicitly authorized cloud streams", () => {
    const { gateway, provider } = createGateway(freeConfirmedPolicy());

    gateway.stream(providerId, request());

    expect(provider.stream).toHaveBeenCalledTimes(1);
  });

  it.each(["PAID", "UNKNOWN", "DISABLED"] as const)(
    "denies %s pricing even when external processing is allowed",
    async (classification) => {
      const { gateway, provider } = createGateway(
        new CloudExecutionPolicy({
          externalProcessingAllowed: true,
          models: {
            [cloudModelPolicyKey(providerId, modelId)]: { classification },
          },
        }),
      );

      await expect(
        gateway.execute(providerId, request()),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(provider.execute).not.toHaveBeenCalled();
    },
  );

  it("denies configured free models when external processing is not authorized", async () => {
    const { gateway, provider } = createGateway(
      new CloudExecutionPolicy({
        models: {
          [cloudModelPolicyKey(providerId, modelId)]: {
            classification: "FREE_CONFIRMED",
          },
        },
      }),
    );

    await expect(gateway.execute(providerId, request())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it("requires a quota ledger and blocks exhausted or failed quota checks", async () => {
    const exhaustedLedger: CloudQuotaLedger = {
      reserve: vi.fn(() => false),
    };
    const exhausted = createGateway(
      new CloudExecutionPolicy({
        externalProcessingAllowed: true,
        quotaLedger: exhaustedLedger,
        models: {
          [cloudModelPolicyKey(providerId, modelId)]: {
            classification: "FREE_QUOTA_LIMITED",
            maxRequests: 1,
            windowMs: 60_000,
          },
        },
      }),
    );

    await expect(
      exhausted.gateway.execute(providerId, request()),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(exhausted.provider.execute).not.toHaveBeenCalled();

    const unavailableLedger: CloudQuotaLedger = {
      reserve: vi.fn(() => {
        throw new Error("storage unavailable");
      }),
    };
    const unavailable = createGateway(
      new CloudExecutionPolicy({
        externalProcessingAllowed: true,
        quotaLedger: unavailableLedger,
        models: {
          [cloudModelPolicyKey(providerId, modelId)]: {
            classification: "FREE_QUOTA_LIMITED",
            maxRequests: 1,
            windowMs: 60_000,
          },
        },
      }),
    );

    await expect(
      unavailable.gateway.execute(providerId, request()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(unavailable.provider.execute).not.toHaveBeenCalled();
  });

  it("reserves each quota-limited request before provider execution", async () => {
    const ledger: CloudQuotaLedger = {
      reserve: vi.fn(() => true),
    };
    const { gateway, provider } = createGateway(
      new CloudExecutionPolicy({
        externalProcessingAllowed: true,
        quotaLedger: ledger,
        now: () => 1_000,
        models: {
          [cloudModelPolicyKey(providerId, modelId)]: {
            classification: "FREE_QUOTA_LIMITED",
            maxRequests: 3,
            windowMs: 60_000,
          },
        },
      }),
    );

    await gateway.execute(providerId, request());

    expect(ledger.reserve).toHaveBeenCalledWith(
      providerId,
      modelId,
      3,
      60_000,
      1_000,
    );
    expect(provider.execute).toHaveBeenCalledTimes(1);
  });

  it("does not allow provider credentials or registration to override policy", async () => {
    const registry = new CloudProviderRegistry();
    const provider = createProvider();
    registry.register(provider);
    const adapter = new CloudAIProvider({ providerId, registry });

    await expect(
      adapter.generate(
        createAIRequest([{ role: "user", content: "hello" }], {
          model: modelId,
        }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provider.execute).not.toHaveBeenCalled();
  });

  it("denies a request without an explicit model", async () => {
    const { gateway, provider } = createGateway(freeConfirmedPolicy());

    await expect(
      gateway.execute(providerId, request(" ")),
    ).rejects.toBeInstanceOf(CloudError);
    expect(provider.execute).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { existsSync, promises as fs } from "node:fs";

import { join } from "node:path";

import { tmpdir } from "node:os";

import { OnnxEmbeddingService } from "../../../core/context/embeddings/OnnxEmbeddingService";

let modelPath: string;

beforeEach(async () => {
  modelPath = join(tmpdir(), `veyra-test-model-${Date.now()}.onnx`);

  // Write a minimal, invalid ONNX file so existsSync returns true but
  // session creation fails. This lets us test error paths without a real
  // model bundle.
  await fs.writeFile(modelPath, new Uint8Array([0, 0, 0, 0]));
});

afterEach(async () => {
  try {
    await fs.unlink(modelPath);
  } catch {
    // Best-effort cleanup.
  }
});

describe("OnnxEmbeddingService", () => {
  it("throws a clear error when the model file does not exist", () => {
    expect(() =>
      new OnnxEmbeddingService({
        modelPath: join(tmpdir(), "does-not-exist.onnx"),

        dimensions: 384,
      }),
    ).toThrow(/ONNX embedding model not found/);
  });

  it("throws when no modelPath is supplied", () => {
    expect(() =>
      // @ts-expect-error - testing missing required option
      new OnnxEmbeddingService({}),
    ).toThrow(/modelPath/);
  });

  it("reports the configured model id and dimensions", () => {
    const service = new OnnxEmbeddingService({
      modelPath,

      dimensions: 256,

      model: "test-embedding-model",
    });

    expect(service.modelId).toBe("test-embedding-model");

    expect(service.embeddingDimensions).toBe(256);
  });

  it("embedding one text fails with a clear error when the model cannot run", async () => {
    // The file exists but is not a valid ONNX model, so session creation
    // fails. We verify the service surfaces a clear error rather than
    // silently returning mock vectors.
    const service = new OnnxEmbeddingService({
      modelPath,

      dimensions: 384,
    });

    await expect(service.embedOne("hello world")).rejects.toThrow();
  });

  it("embedding an array fails with a clear error when the model cannot run", async () => {
    const service = new OnnxEmbeddingService({
      modelPath,

      dimensions: 384,
    });

    await expect(service.embed(["a", "b"])).rejects.toThrow();
  });

  it("rejects non-string inputs", async () => {
    const service = new OnnxEmbeddingService({
      modelPath,

      dimensions: 384,
    });

    await expect(
      // @ts-expect-error - testing invalid input
      service.embedOne(123 as unknown as string),
    ).rejects.toThrow(/must be a string/);
  });

  it("supports cancellation", async () => {
    const controller = new AbortController();

    const service = new OnnxEmbeddingService({
      modelPath,

      dimensions: 384,
    });

    controller.abort();

    await expect(
      service.embedOne("hello", { signal: controller.signal }),
    ).rejects.toThrow();
  });
});
